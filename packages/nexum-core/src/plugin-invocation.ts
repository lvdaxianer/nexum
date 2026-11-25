/**
 * Nexum Plugin 的显式命中、自然路由结果和激活端口契约。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */

import type { NexumPluginRegistry, NexumPluginStatus, NexumPluginSummary } from "./plugin-registry.js"

/** Plugin mention 在原始用户输入中的位置。 */
export interface NexumPluginMention {
  /** 原始输入中的起始 UTF-16 下标。 */
  readonly start: number
  /** 原始输入中的结束 UTF-16 下标。 */
  readonly end: number
  /** 包含 @ 前缀的原始 mention 文本。 */
  readonly text: string
}

/** Plugin 命中来源。 */
export type NexumPluginInvocationSource = "explicit" | "automatic"

/** Plugin 路由器对一条用户输入的判定结果。 */
export type NexumPluginRouteDecision =
  | { readonly kind: "explicit"; readonly pluginID: string; readonly mention: NexumPluginMention }
  | { readonly kind: "automatic"; readonly pluginID: string; readonly candidates: readonly string[] }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "none"; readonly reason: "no_match" | "no_explicit_mention" }

/** Plugin 激活请求。 */
export interface NexumPluginActivationInput {
  readonly sessionID: string
  readonly pluginID: string
  readonly source: NexumPluginInvocationSource
}

/** Plugin 激活完成后的最小结果。 */
export interface NexumPluginActivationResult {
  readonly pluginID: string
  readonly status: Extract<NexumPluginStatus, "active">
  readonly source: NexumPluginInvocationSource
}

/** 显式 @ 与自然语言路由共享的 Plugin 激活端口。 */
export interface NexumPluginActivationPort {
  readonly activate: (input: NexumPluginActivationInput) => Promise<NexumPluginActivationResult>
}

/** Plugin 显式 mention 调用请求。 */
export interface NexumPluginInvocationInput {
  readonly sessionID: string
  readonly text: string
}

/** 与独立 Skill 解析器并列的 Plugin 显式调用端口。 */
export interface NexumPluginInvocationPort {
  readonly resolve: (input: NexumPluginInvocationInput) => Promise<readonly NexumPluginActivationResult[]>
}

/** Plugin 显式调用端口依赖。 */
export interface NexumPluginInvocationOptions {
  readonly registry: Pick<NexumPluginRegistry, "list">
  readonly activation: NexumPluginActivationPort
}

/** Plugin 命中失败的稳定错误码。 */
export type NexumPluginInvocationErrorCode =
  | "plugin_not_found"
  | "plugin_not_ready"
  | "plugin_permission_denied"
  | "plugin_internal_mention"
  | "plugin_ambiguous"
  | "plugin_route_not_found"

/** Plugin 命中或激活失败错误，供 API/UI 映射稳定错误码。 */
export class NexumPluginInvocationError extends Error {
  /**
   * 创建 Plugin 调用错误。
   *
   * @param code - 稳定错误码
   * @param message - 面向日志或 UI 的错误消息
   * @param pluginID - 可选的目标 Plugin ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-25
   */
  constructor(
    readonly code: NexumPluginInvocationErrorCode,
    message: string,
    readonly pluginID?: string,
  ) {
    super(message)
    this.name = "NexumPluginInvocationError"
  }
}

/** Plugin mention 的解析规则。 */
const PLUGIN_MENTION = /(^|[\s([{"'])@([a-z0-9]+(?:-[a-z0-9]+)*)(\/[^\s]+)?/g

/**
 * 从用户输入中解析顶层 Plugin mention。
 *
 * @param text - 用户原始输入
 * @param summaries - 当前可见的 Plugin 摘要
 * @returns 显式 Plugin 命中结果；没有显式 mention 时返回 undefined
 * @throws {NexumPluginInvocationError} mention 指向未知 Plugin 或内部能力时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function parseNexumPluginMention(
  text: string,
  summaries: readonly NexumPluginSummary[],
): Extract<NexumPluginRouteDecision, { readonly kind: "explicit" }> | undefined {
  PLUGIN_MENTION.lastIndex = 0
  const match = PLUGIN_MENTION.exec(text)
  if (!match) return undefined
  return createExplicitDecision(match[0], match.index ?? 0, summaries)
}

/**
 * 解析一条输入中的全部顶层 Plugin mention。
 *
 * 未注册的 @mention 留给独立 Skill 解析器或其他顶层能力处理；
 * 已注册 Plugin 的内部路径仍然稳定拒绝。
 * @param text - 用户原始输入
 * @param summaries - 当前可见的 Plugin 摘要
 * @returns 按原始输入顺序排列的已注册 Plugin 命中结果
 * @throws {NexumPluginInvocationError} mention 指向已注册 Plugin 的内部能力时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function parseNexumPluginMentions(
  text: string,
  summaries: readonly NexumPluginSummary[],
): readonly Extract<NexumPluginRouteDecision, { readonly kind: "explicit" }>[] {
  PLUGIN_MENTION.lastIndex = 0
  return [...text.matchAll(PLUGIN_MENTION)].flatMap((match) => {
    const mentionText = match[0]
    const atIndex = mentionText.indexOf("@")
    const pluginID = mentionText.slice(atIndex + 1).split("/")[0]
    if (!summaries.some((item) => item.id === pluginID)) return []
    return [createExplicitDecision(mentionText, match.index ?? 0, summaries)]
  })
}

/**
 * 创建只负责显式 Plugin mention 的调用端口。
 *
 * 同一个 Plugin 在一条输入中只激活一次，激活顺序保持 mention 首次出现顺序；
 * 自然语言路由使用同一个激活端口但不在此处推断。
 * @param options - Plugin 摘要 Registry 与统一激活端口
 * @returns Plugin 显式调用端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createNexumPluginInvocationPort(options: NexumPluginInvocationOptions): NexumPluginInvocationPort {
  return {
    resolve: async (input) => {
      const summaries = await options.registry.list()
      const decisions = deduplicatePluginDecisions(parseNexumPluginMentions(input.text, summaries))
      return Promise.all(decisions.map((decision) => options.activation.activate({
        sessionID: input.sessionID,
        pluginID: decision.pluginID,
        source: "explicit",
      })))
    },
  }
}

/**
 * 按 Plugin ID 去重显式命中，保留首次 mention 顺序。
 *
 * @param decisions - 原始 Plugin 命中结果
 * @returns 去重后的 Plugin 命中结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function deduplicatePluginDecisions(
  decisions: readonly Extract<NexumPluginRouteDecision, { readonly kind: "explicit" }>[],
): readonly Extract<NexumPluginRouteDecision, { readonly kind: "explicit" }>[] {
  const seen = new Set<string>()
  return decisions.filter((decision) => {
    if (seen.has(decision.pluginID)) return false
    seen.add(decision.pluginID)
    return true
  })
}

/**
 * 将正则命中的原文转换成顶层 Plugin 路由结果。
 *
 * @param mentionText - 包含边界前缀的正则命中文本
 * @param summaries - 当前可见的 Plugin 摘要
 * @returns 顶层 Plugin 的显式命中结果
 * @throws {NexumPluginInvocationError} mention 指向未知 Plugin 或内部能力时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function createExplicitDecision(
  mentionText: string,
  matchStart: number,
  summaries: readonly NexumPluginSummary[],
): Extract<NexumPluginRouteDecision, { readonly kind: "explicit" }> {
  const atIndex = mentionText.indexOf("@")
  const text = mentionText.slice(atIndex)
  const [pluginID = "", ...path] = text.slice(1).split("/")
  const summary = summaries.find((item) => item.id === pluginID)
  if (!summary) throw new NexumPluginInvocationError("plugin_not_found", `Plugin 不存在: ${pluginID}`, pluginID)
  if (path.length > 0) {
    throw new NexumPluginInvocationError("plugin_internal_mention", "Plugin 内部能力不能直接 @", pluginID)
  }
  const start = matchStart + atIndex
  return { kind: "explicit", pluginID, mention: { start, end: start + text.length, text } }
}
