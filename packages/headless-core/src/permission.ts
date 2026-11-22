/**
 * Headless Core 的内存权限审批 Broker。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { PermissionEffect, PermissionPort, ToolRequest } from "./index.js"
import type { HeadlessInteractionStore } from "./interaction-store.js"

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
  readonly cancel: (sessionID: string, requestID?: string) => Promise<void>
}

export interface HeadlessPermissionBrokerOptions {
  readonly interactionStore?: HeadlessInteractionStore
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
export function createHeadlessPermissionBroker(options: HeadlessPermissionBrokerOptions = {}): HeadlessPermissionBroker {
  const pending = new Map<string, PendingPermission>()
  const resolved = new Map<string, { sessionID: string; decision: HeadlessPermissionDecision }>()
  const allowAlways = new Set<string>()

  return {
    async evaluate(request: ToolRequest): Promise<PermissionEffect> {
      const policyKey = `${request.action}:${request.resource}`
      if (allowAlways.has(policyKey)) return "allow"

      const permission = createPendingPermission(request)
      const decisionPromise = new Promise<HeadlessPermissionDecision>((resolve) => {
        pending.set(permission.request.id, { ...permission, resolve })
      })
      try {
        await options.interactionStore?.save({
          requestID: permission.request.id,
          sessionID: permission.request.sessionID,
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kind: "permission",
          action: permission.request.action,
          resource: permission.request.resource,
          reason: permission.request.reason,
        })
      } catch (error) {
        pending.delete(permission.request.id)
        throw error
      }
      const decision = await decisionPromise
      pending.delete(permission.request.id)
      await options.interactionStore?.delete(permission.request.id)
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
    async cancel(sessionID, requestID) {
      let cancelled = false
      for (const [id, active] of pending) {
        if (active.request.sessionID !== sessionID || (requestID !== undefined && requestID !== id)) continue
        active.settled = "deny"
        active.resolve("deny")
        void options.interactionStore?.delete(id)
        cancelled = true
        if (requestID !== undefined) break
      }
      if (requestID !== undefined && !cancelled && resolved.get(requestID)?.sessionID !== sessionID) {
        throw new HeadlessPermissionError("not_found", "权限请求不存在")
      }
    },
  }
}

function createPendingPermission(request: ToolRequest): PendingPermission {
  return {
    request: {
      id: crypto.randomUUID(),
      sessionID: request.sessionID,
      action: request.action,
      resource: redactHeadlessSensitiveText(request.resource),
      reason: `工具 ${request.toolName} 需要权限审批`,
    },
    resolve: () => undefined,
  }
}

/** 对权限展示和运行事件中的文本做凭据值脱敏。 */
export function redactHeadlessSensitiveText(value: string): string {
  return value.replace(
    /((?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*(?:bearer\s+)?)([^\s'",;]+)/gi,
    "$1[REDACTED]",
  )
}

/** 递归脱敏权限事件中的字符串、数组和对象值。 */
export function redactHeadlessSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") return redactHeadlessSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactHeadlessSensitiveValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactHeadlessSensitiveValue(item)]))
  }
  return value
}

/** 校验外部传入的权限决策。 */
function assertDecision(decision: string): asserts decision is HeadlessPermissionDecision {
  if (decision !== "allow_once" && decision !== "allow_always" && decision !== "deny") {
    throw new HeadlessPermissionError("invalid_decision", "无效的权限决策")
  }
}
