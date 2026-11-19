/**
 * Headless Core 的内存权限审批 Broker。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { PermissionEffect, PermissionPort, ToolRequest } from "./index.js"

/** Headless 权限审批决策。 */
export type HeadlessPermissionDecision = "allow_once" | "allow_always" | "deny"

/** 对外展示的待审批权限请求。 */
export interface HeadlessPermissionRequest {
  readonly id: string
  readonly sessionID: string
  readonly action: string
  readonly resource: string
  readonly reason?: string
}

/** 权限审批请求参数。 */
export interface HeadlessPermissionReply {
  readonly sessionID: string
  readonly requestID: string
  readonly decision: HeadlessPermissionDecision
}

/** 权限 Broker 领域错误码。 */
export type HeadlessPermissionErrorCode = "invalid_decision" | "not_found" | "session_mismatch"

/** 权限 Broker 领域错误。 */
export class HeadlessPermissionError extends Error {
  constructor(
    readonly code: HeadlessPermissionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessPermissionError"
  }
}

/** 可阻塞等待审批并查询/回复 pending request 的权限端口。 */
export interface HeadlessPermissionBroker extends PermissionPort {
  readonly list: (sessionID: string) => Promise<readonly HeadlessPermissionRequest[]>
  readonly reply: (input: HeadlessPermissionReply) => Promise<HeadlessPermissionDecision>
}

interface PendingPermission {
  readonly request: HeadlessPermissionRequest
  readonly resolve: (decision: HeadlessPermissionDecision) => void
  settled?: HeadlessPermissionDecision
}

/**
 * 创建默认 ask 策略的内存权限 Broker。
 *
 * @returns 会阻塞工具执行并等待显式 reply 的 PermissionPort
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessPermissionBroker(): HeadlessPermissionBroker {
  const pending = new Map<string, PendingPermission>()
  const resolved = new Map<string, { sessionID: string; decision: HeadlessPermissionDecision }>()
  const allowAlways = new Set<string>()

  return {
    async evaluate(request: ToolRequest): Promise<PermissionEffect> {
      const policyKey = `${request.action}:${request.resource}`
      if (allowAlways.has(policyKey)) return "allow"

      const permission = createPendingPermission(request)
      pending.set(permission.request.id, permission)
      const decision = await new Promise<HeadlessPermissionDecision>((resolve) => {
        pending.set(permission.request.id, { ...permission, resolve })
      })
      pending.delete(permission.request.id)
      resolved.set(permission.request.id, { sessionID: request.sessionID, decision })
      if (decision === "allow_always") allowAlways.add(policyKey)
      return decision === "deny" ? "deny" : "allow"
    },
    async list(sessionID) {
      return Array.from(pending.values())
        .filter((item) => item.request.sessionID === sessionID)
        .map((item) => ({ ...item.request }))
    },
    async reply(input) {
      assertDecision(input.decision)
      const active = pending.get(input.requestID)
      if (active) {
        if (active.request.sessionID !== input.sessionID) {
          throw new HeadlessPermissionError("session_mismatch", "权限请求不属于当前 Session")
        }
        if (active.settled) return active.settled
        active.settled = input.decision
        active.resolve(input.decision)
        return input.decision
      }
      const previous = resolved.get(input.requestID)
      if (previous?.sessionID === input.sessionID) return previous.decision
      throw new HeadlessPermissionError("not_found", "权限请求不存在")
    },
  }
}

function createPendingPermission(request: ToolRequest): PendingPermission {
  return {
    request: {
      id: crypto.randomUUID(),
      sessionID: request.sessionID,
      action: request.action,
      resource: request.resource,
      reason: `工具 ${request.toolName} 需要权限审批`,
    },
    resolve: () => undefined,
  }
}

/** 校验外部传入的权限决策。 */
function assertDecision(decision: string): asserts decision is HeadlessPermissionDecision {
  if (decision !== "allow_once" && decision !== "allow_always" && decision !== "deny") {
    throw new HeadlessPermissionError("invalid_decision", "无效的权限决策")
  }
}
