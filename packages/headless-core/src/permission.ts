/**
 * Headless Core 的内存权限审批 Broker。
 *
 * Broker 先按持久化权限策略判定：命中 `allow` 直接放行，命中 `deny` 直接拒绝，
 * 未命中策略时才创建 pending 请求阻塞等待 UI 决策。单次批准仍然可用；「始终允许」
 * 会同时写入进程内的精确授权和 action-agnostic（只按资源匹配所有工具）的全局 allow
 * 策略，重启后策略依然生效。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { PermissionEffect, PermissionPort, PermissionRequestSnapshot, ToolRequest } from "./index.js"
import type { HeadlessInteractionStore } from "./interaction-store.js"
import {
  createInMemoryPermissionPolicyStore,
  evaluateHeadlessPermissionPolicy,
  headlessAnyToolAction,
  type HeadlessPermissionPolicyStore,
} from "./permission-policy.js"
import { redactHeadlessSensitiveText, redactHeadlessSensitiveValue } from "./redaction.js"

export { redactHeadlessSensitiveText, redactHeadlessSensitiveValue }

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
  /** 该 Broker 使用的权限策略存储，供管理接口读写。 */
  readonly policy: HeadlessPermissionPolicyStore
  readonly list: (sessionID: string) => Promise<readonly HeadlessPermissionRequest[]>
  readonly reply: (input: HeadlessPermissionReply) => Promise<HeadlessPermissionDecision>
  readonly cancel: (sessionID: string, requestID?: string) => Promise<void>
}

export interface HeadlessPermissionBrokerOptions {
  readonly interactionStore?: HeadlessInteractionStore
  /** 缺省使用进程内策略 Store；服务端注入文件 Store 以支持重启恢复。 */
  readonly policyStore?: HeadlessPermissionPolicyStore
}

interface PendingPermission {
  readonly request: HeadlessPermissionRequest
  readonly resolve: (decision: HeadlessPermissionDecision) => void
  settled?: HeadlessPermissionDecision
}

/**
 * 创建先查策略、再逐次询问的权限 Broker。
 *
 * @param options - 交互持久化与权限策略 Store
 * @returns 会先判定策略、未命中时阻塞等待显式 reply 的 PermissionPort
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessPermissionBroker(options: HeadlessPermissionBrokerOptions = {}): HeadlessPermissionBroker {
  const pending = new Map<string, PendingPermission>()
  const resolved = new Map<string, { sessionID: string; decision: HeadlessPermissionDecision }>()
  const allowAlways = new Set<string>()
  const observers = new Set<(request: PermissionRequestSnapshot) => Promise<void> | void>()
  const policy = options.policyStore ?? createInMemoryPermissionPolicyStore()

  return {
    policy,
    async evaluate(request: ToolRequest): Promise<PermissionEffect> {
      const decision = evaluateHeadlessPermissionPolicy(request, await policy.list())
      if (decision.effect !== "ask") return decision.effect
      // 进程内的「始终允许」授权只覆盖完全相同的 action 和 resource，且不能越过策略拒绝。
      if (allowAlways.has(`${request.action}:${request.resource}`)) return "allow"

      const permission = createPendingPermission(request)
      const decisionPromise = new Promise<HeadlessPermissionDecision>((resolve) => {
        pending.set(permission.request.id, { ...permission, resolve })
      })
      // 先同步通知观察者，再落盘和阻塞，保证 permission.requested 带真实 requestID 先发出。
      for (const observer of observers) await observer(permission.request)
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
      const reply = await decisionPromise
      pending.delete(permission.request.id)
      await options.interactionStore?.delete(permission.request.id)
      resolved.set(permission.request.id, { sessionID: request.sessionID, decision: reply })
      if (reply === "allow_always") {
        allowAlways.add(`${request.action}:${request.resource}`)
        await rememberAlwaysAllowed(policy, request)
      }
      return reply === "deny" ? "deny" : "allow"
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
    observe(listener) {
      observers.add(listener)
      return () => void observers.delete(listener)
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

/**
 * 把「始终允许」固化为 action-agnostic 的全局策略，供后续同资源请求和重启后的服务复用。
 *
 * 规则使用 `action = "*"`，只按 resource 匹配所有工具；危险操作仍要求 resource 精确匹配，
 * 因此这里写入的是用户刚刚批准的精确资源。策略写入失败不影响本次已经批准的调用；
 * 重复策略由 Store 拒绝，这里同样忽略。
 *
 * @param policy - 权限策略存储
 * @param request - 已获批准的工具请求
 * @returns 写入完成的 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function rememberAlwaysAllowed(policy: HeadlessPermissionPolicyStore, request: ToolRequest): Promise<void> {
  await policy
    .add({ action: headlessAnyToolAction, resource: request.resource, effect: "allow", scope: "global" })
    .catch(() => undefined)
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

/** 校验外部传入的权限决策。 */
function assertDecision(decision: string): asserts decision is HeadlessPermissionDecision {
  if (decision !== "allow_once" && decision !== "allow_always" && decision !== "deny") {
    throw new HeadlessPermissionError("invalid_decision", "无效的权限决策")
  }
}
