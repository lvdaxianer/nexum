/**
 * Headless Core 的最小端口契约与组合入口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

/** Agent 请求模型生成时携带的最小输入。 */
export interface ModelPrompt {
  readonly sessionID: string
  readonly text: string
}

/** 模型生成过程中向 Coding Loop 输出的最小增量。 */
export interface ModelChunk {
  readonly type: "text" | "tool-call" | "completed"
  readonly content?: string
  readonly toolName?: string
}

/** 模型端口负责产生 Agent 下一步所需的增量结果。 */
export interface ModelPort {
  readonly prompt: (input: ModelPrompt) => AsyncIterable<ModelChunk>
}

/** 工具调用请求。 */
export interface ToolRequest {
  readonly sessionID: string
  readonly toolName: string
  readonly input: Record<string, unknown>
}

/** 工具调用结果。 */
export interface ToolResult {
  readonly ok: boolean
  readonly output: string
}

/** 工具端口负责执行已经通过权限判断的工具调用。 */
export interface ToolPort {
  readonly execute: (request: ToolRequest) => Promise<ToolResult>
}

/** 权限评估结果。 */
export type PermissionEffect = "allow" | "deny" | "ask"

/** 权限端口负责判断工具调用是否可以继续。 */
export interface PermissionPort {
  readonly evaluate: (request: ToolRequest) => Promise<PermissionEffect>
}

/** Session 的最小持久化记录。 */
export interface SessionRecord {
  readonly sessionID: string
  readonly directory: string
  readonly status: "idle" | "running" | "completed" | "failed" | "cancelled"
}

/** Session 存储端口。 */
export interface SessionStore {
  readonly get: (sessionID: string) => Promise<SessionRecord | undefined>
  readonly save: (session: SessionRecord) => Promise<void>
}

/** Headless Runtime 对外发布的最小事件。 */
export interface RuntimeEvent {
  readonly type: string
  readonly sessionID: string
  readonly sequence: number
}

/** 运行事件端口。 */
export interface EventSink {
  readonly publish: (event: RuntimeEvent) => Promise<void>
}

/** Headless Core 的全部外部依赖端口。 */
export interface HeadlessCorePorts {
  readonly model: ModelPort
  readonly tool: ToolPort
  readonly permission: PermissionPort
  readonly sessions: SessionStore
  readonly events: EventSink
}

/** Headless Core 创建参数。 */
export interface HeadlessCoreOptions {
  readonly ports: HeadlessCorePorts
}

/**
 * 已完成端口绑定的 Headless Core。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export interface HeadlessCore {
  readonly ports: HeadlessCorePorts
}

/**
 * 创建不依赖 UI 的 Headless Core 组合入口。
 *
 * @param options - Core 运行所需的外部端口
 * @returns 已绑定端口的 Headless Core
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessCore(options: HeadlessCoreOptions): HeadlessCore {
  return { ports: options.ports }
}
