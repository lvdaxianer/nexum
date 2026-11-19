/**
 * Headless Core 的最小端口契约与组合入口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { access, constants, stat } from "node:fs/promises"
import { isAbsolute, normalize } from "node:path"

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

/** Headless Session 的状态类型。 */
export type HeadlessSessionStatus = SessionRecord["status"]

/** 可由 Headless Session Service 返回的领域错误类型。 */
export type HeadlessSessionErrorCode = "invalid_directory" | "session_not_found" | "invalid_transition"

/** Headless Session 创建请求。 */
export interface HeadlessSessionCreateInput {
  readonly directory: string
}

/** Headless Session Service 的可替换目录校验端口。 */
export interface HeadlessDirectoryValidator {
  readonly validate: (directory: string) => Promise<void>
}

/** 可观察和推进 Session 生命周期的最小服务接口。 */
export interface HeadlessSessionService {
  readonly create: (input: HeadlessSessionCreateInput) => Promise<SessionRecord>
  readonly get: (sessionID: string) => Promise<SessionRecord | undefined>
  readonly setStatus: (sessionID: string, status: HeadlessSessionStatus) => Promise<SessionRecord>
}

/** Headless Session Service 的依赖配置。 */
export interface HeadlessSessionServiceOptions {
  readonly store?: SessionStore
  readonly directoryValidator?: HeadlessDirectoryValidator
}

/** 可供测试和 POC 使用的内存 SessionStore。 */
export interface InMemorySessionStore extends SessionStore {
  readonly list: () => Promise<readonly SessionRecord[]>
}

/** Session 领域错误，包含稳定的机器可读错误码。 */
export class HeadlessSessionError extends Error {
  constructor(
    readonly code: HeadlessSessionErrorCode,
    message: string,
    readonly sessionID?: string,
  ) {
    super(message)
    this.name = "HeadlessSessionError"
  }
}

/**
 * 创建进程内 SessionStore。
 *
 * @returns 可读写的内存 SessionStore
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createInMemorySessionStore(): InMemorySessionStore {
  const sessions = new Map<string, SessionRecord>()

  return {
    async get(sessionID) {
      const session = sessions.get(sessionID)
      return session ? { ...session } : undefined
    },
    async save(session) {
      sessions.set(session.sessionID, { ...session })
    },
    async list() {
      return Array.from(sessions.values(), (session) => ({ ...session }))
    },
  }
}

/**
 * 校验 Headless Session 的工作目录。
 *
 * @param directory - 待校验的绝对工作目录
 * @throws 当目录不是绝对路径、不存在、不是目录或不可读写时抛出领域错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export async function validateHeadlessDirectory(directory: string): Promise<void> {
  const trimmed = directory.trim()
  if (!trimmed) {
    throw new HeadlessSessionError("invalid_directory", "工作目录不能为空")
  }
  const normalized = normalize(trimmed)
  if (!isAbsolute(normalized)) {
    throw new HeadlessSessionError("invalid_directory", "工作目录必须是绝对路径")
  }

  try {
    const details = await stat(normalized)
    if (!details.isDirectory()) {
      throw new HeadlessSessionError("invalid_directory", "工作目录必须是目录")
    }
    await access(normalized, constants.R_OK | constants.W_OK)
  } catch (error) {
    if (error instanceof HeadlessSessionError) throw error
    throw new HeadlessSessionError("invalid_directory", "工作目录不存在或不可访问")
  }
}

/**
 * 创建独立 Headless Session Service。
 *
 * @param options - SessionStore 与目录校验器
 * @returns 负责创建和管理 Session 状态的服务
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessSessionService(options: HeadlessSessionServiceOptions = {}): HeadlessSessionService {
  const store = options.store ?? createInMemorySessionStore()
  const directoryValidator = options.directoryValidator ?? { validate: validateHeadlessDirectory }

  return {
    async create(input) {
      const directory = normalize(input.directory.trim())
      await directoryValidator.validate(directory)
      const session: SessionRecord = {
        sessionID: crypto.randomUUID(),
        directory,
        status: "idle",
      }
      await store.save(session)
      return session
    },
    get(sessionID) {
      return store.get(sessionID)
    },
    async setStatus(sessionID, status) {
      const current = await store.get(sessionID)
      if (!current) {
        throw new HeadlessSessionError("session_not_found", "Session 不存在", sessionID)
      }
      if (current.status === status) return current
      if (!isAllowedTransition(current.status, status)) {
        throw new HeadlessSessionError(
          "invalid_transition",
          `Session 状态不能从 ${current.status} 变更为 ${status}`,
          sessionID,
        )
      }
      const next = { ...current, status }
      await store.save(next)
      return next
    },
  }
}

/** 判断 Session 是否允许进入目标状态。 */
function isAllowedTransition(from: HeadlessSessionStatus, to: HeadlessSessionStatus): boolean {
  if (from === "idle") return to === "running" || to === "cancelled"
  if (from === "running") return to === "completed" || to === "failed" || to === "cancelled"
  return false
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
