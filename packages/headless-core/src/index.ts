/**
 * Headless Core 的最小端口契约与组合入口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { access, constants, stat } from "node:fs/promises"
import { isAbsolute, normalize } from "node:path"
import { createOpenAICompatibleModelPort } from "./model.js"
import type { HeadlessModelConfigStore } from "./model-config.js"
import type {
  ContextCompactionPort,
  ContextCompactionResult,
  HeadlessQuestionItem,
  HeadlessQuestionPort,
  HeadlessQuestionRequest,
  ProjectContextPort,
} from "./context.js"
import { redactHeadlessSensitiveValue } from "./permission.js"
import { normalizeHeadlessToolRequest } from "./tools.js"

/** Agent 请求模型生成时携带的最小输入。 */
export interface ModelToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

/** 模型响应中的工具调用。 */
export interface ModelToolCall {
  readonly id: string
  readonly name: string
  readonly input: Record<string, unknown>
}

/** OpenAI-compatible Chat Completions 消息的内部表示。 */
export type ModelMessage =
  | { readonly role: "system"; readonly content: string; readonly sourceID?: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant"
      readonly content?: string
      readonly toolCalls?: readonly ModelToolCall[]
    }
  | { readonly role: "tool"; readonly toolCallID: string; readonly content: string }

/** Agent 请求模型生成时携带的最小输入。 */
export interface ModelPrompt {
  readonly sessionID: string
  readonly text: string
  readonly toolResults?: readonly ToolResult[]
  readonly messages?: readonly ModelMessage[]
  readonly tools?: readonly ModelToolDefinition[]
  readonly signal?: AbortSignal
}

/** 模型生成过程中向 Coding Loop 输出的最小增量。 */
export interface ModelChunk {
  readonly type: "text" | "tool-call" | "question" | "completed"
  readonly content?: string
  readonly toolCallID?: string
  readonly toolName?: string
  readonly toolInput?: Record<string, unknown>
  readonly toolCalls?: readonly ModelToolCall[]
  readonly questionID?: string
  readonly questions?: readonly HeadlessQuestionItem[]
}

/** 模型端口负责产生 Agent 下一步所需的增量结果。 */
export interface ModelPort {
  readonly prompt: (input: ModelPrompt) => AsyncIterable<ModelChunk>
}

/** 工具调用请求。 */
export interface ToolRequest {
  readonly sessionID: string
  readonly toolName: string
  readonly action: string
  readonly resource: string
  readonly input: Record<string, unknown>
}

/** 工具调用结果。 */
export interface ToolResult {
  readonly ok: boolean
  readonly output: string
  readonly toolCallID?: string
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
  readonly cancel?: (sessionID: string, requestID?: string) => Promise<void>
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

/** Coding Loop 的一次 Prompt 输入。 */
export interface HeadlessCodingLoopInput {
  readonly sessionID: string
  readonly text: string
}

/** Coding Loop 的可替换运行依赖。 */
export interface HeadlessCodingLoopOptions {
  readonly model: ModelPort
  readonly tool: ToolPort
  readonly permission: PermissionPort
  readonly sessions: HeadlessSessionService
  readonly events: EventSink
  readonly tools?: readonly ModelToolDefinition[]
  readonly contextCompaction?: ContextCompactionPort
  readonly projectContext?: ProjectContextPort
  readonly question?: HeadlessQuestionPort
  readonly compactionThreshold?: number
  readonly compactionKeepRecent?: number
  readonly maxSteps?: number
}

/** 使用活动模型配置创建 Coding Loop 的参数。 */
export interface HeadlessConfiguredCodingLoopOptions extends Omit<HeadlessCodingLoopOptions, "model"> {
  readonly modelConfig: HeadlessModelConfigStore
}

/** 单 Agent Headless Coding Loop。 */
export interface HeadlessCodingLoop {
  readonly run: (input: HeadlessCodingLoopInput) => Promise<SessionRecord>
  readonly cancel: (sessionID: string) => Promise<SessionRecord>
}

/**
 * 创建最小单 Agent Coding Loop。
 *
 * 每次工具调用都会先经过 PermissionPort；被允许后执行工具，
 * 再把工具结果作为下一次 ModelPort 输入继续运行。
 *
 * @param options - 模型、工具、权限、Session 和事件端口
 * @returns 可执行一次 Prompt 的 Coding Loop
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessCodingLoop(options: HeadlessCodingLoopOptions): HeadlessCodingLoop {
  const maxSteps = options.maxSteps ?? 16
  const activeRuns = new Map<string, ActiveRun>()

  return {
    async run(input) {
      const session = await options.sessions.get(input.sessionID)
      if (!session) {
        throw new HeadlessSessionError("session_not_found", "Session 不存在", input.sessionID)
      }

      await options.sessions.setStatus(input.sessionID, "running")
      const runState: ActiveRun = { controller: new AbortController(), cancelled: false }
      activeRuns.set(input.sessionID, runState)
      let sequence = 0
      let messages: ModelMessage[] = [{ role: "user", content: input.text }]
      messages = await restoreProjectContext(input.sessionID, messages, options.projectContext)
      let prompt: ModelPrompt = {
        sessionID: input.sessionID,
        text: input.text,
        messages,
        ...(options.tools ? { tools: options.tools } : {}),
      }

      const publish = async (type: string, data?: Record<string, unknown>) => {
        await options.events.publish({ sessionID: input.sessionID, type, sequence: ++sequence, data })
      }

      try {
        for (let step = 0; step < maxSteps; step++) {
          throwIfCancelled(runState)
          messages = await compactMessagesIfNeeded(messages, options, publish)
          messages = await restoreProjectContext(input.sessionID, messages, options.projectContext)
          prompt = { ...prompt, messages }
          let continued = false
          for await (const chunk of options.model.prompt({ ...prompt, signal: runState.controller.signal })) {
            throwIfCancelled(runState)
            if (chunk.type === "text") {
              await publish("assistant.text", { content: chunk.content ?? "" })
              continue
            }
            if (chunk.type === "completed") {
              const completed = await options.sessions.setStatus(input.sessionID, "completed")
              await publish("session.completed")
              return completed
            }

            const questionChunk = toQuestionChunk(chunk)
            if (questionChunk) {
              const request = createQuestionRequest(input.sessionID, questionChunk)
              await publish("question.request", {
                requestID: request.id,
                toolCallID: request.toolCallID,
                questions: request.questions,
              })
              if (!options.question) throw new Error("Question 端口未配置")
              const result = await options.question.ask(request)
              if (!result.ok) {
                await publish("question.cancelled", { requestID: request.id, toolCallID: request.toolCallID })
                throw new Error(result.output)
              }
              await publish("question.result", { requestID: request.id, toolCallID: request.toolCallID })
              messages = appendQuestionResult(messages, request, result)
              prompt = {
                sessionID: input.sessionID,
                text: input.text,
                toolResults: [result],
                messages,
                ...(options.tools ? { tools: options.tools } : {}),
              }
              continued = true
              break
            }

            const toolCalls = chunk.toolCalls ?? [legacyToolCall(chunk)]
            messages = [
              ...messages,
              {
                role: "assistant",
                toolCalls,
              },
            ]
            const toolResults: ToolResult[] = []
            for (const toolCall of toolCalls) {
              const request = makeToolRequest(input.sessionID, toolCall)
              const toolCallID = toolCall.id
              await publish("tool.request", {
                toolCallID,
                action: request.action,
                resource: redactHeadlessSensitiveValue(request.resource) as string,
                toolName: request.toolName,
                input: redactHeadlessSensitiveValue(request.input) as Record<string, unknown>,
              })
              const effect = await options.permission.evaluate(request)
              if (effect !== "allow") {
                throw new Error(effect === "deny" ? "工具请求被拒绝" : "工具请求需要权限审批")
              }
              const result = await options.tool.execute(request)
              const toolResult = { ...result, toolCallID }
              toolResults.push(toolResult)
              await publish("tool.result", { toolCallID, ok: result.ok, output: result.output })
              messages = [...messages, { role: "tool", toolCallID, content: result.output }]
            }
            prompt = {
              sessionID: input.sessionID,
              text: input.text,
              toolResults,
              messages,
              ...(options.tools ? { tools: options.tools } : {}),
            }
            continued = true
            break
          }

          if (continued) continue
          const completed = await options.sessions.setStatus(input.sessionID, "completed")
          await publish("session.completed")
          return completed
        }

        throw new Error("Coding Loop 超过最大模型步骤数")
      } catch (error) {
        if (runState.cancelled || runState.controller.signal.aborted || error instanceof HeadlessCancellationError) {
          const current = await options.sessions.get(input.sessionID)
          const cancelled =
            current?.status === "cancelled" ? current : await options.sessions.setStatus(input.sessionID, "cancelled")
          await publish("session.cancelled")
          return cancelled
        }
        await options.sessions.setStatus(input.sessionID, "failed")
        await publish("session.failed", { message: safeErrorMessage(error) })
        throw error
      } finally {
        if (activeRuns.get(input.sessionID) === runState) activeRuns.delete(input.sessionID)
      }
    },
    async cancel(sessionID) {
      const current = await options.sessions.get(sessionID)
      if (!current) {
        throw new HeadlessSessionError("session_not_found", "Session 不存在", sessionID)
      }
      const active = activeRuns.get(sessionID)
      if (active) {
        active.cancelled = true
        active.controller.abort()
        await options.permission.cancel?.(sessionID)
      }
      if (current.status === "idle" || current.status === "running") {
        return options.sessions.setStatus(sessionID, "cancelled")
      }
      return current
    },
  }
}

/**
 * 使用当前活动模型配置创建单 Agent Coding Loop。
 *
 * @param options - 模型配置与工具、权限、Session、事件端口
 * @returns 绑定 OpenAI-compatible ModelPort 的 Coding Loop
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessConfiguredCodingLoop(options: HeadlessConfiguredCodingLoopOptions): HeadlessCodingLoop {
  return createHeadlessCodingLoop({
    ...options,
    model: createOpenAICompatibleModelPort({ config: options.modelConfig }),
  })
}

interface ActiveRun {
  readonly controller: AbortController
  cancelled: boolean
}

/** Coding Loop 内部取消控制流错误。 */
class HeadlessCancellationError extends Error {
  constructor() {
    super("Coding Loop 已取消")
    this.name = "HeadlessCancellationError"
  }
}

/** 在模型或工具边界检查取消信号。 */
function throwIfCancelled(run: ActiveRun): void {
  if (run.cancelled || run.controller.signal.aborted) throw new HeadlessCancellationError()
}

/** 从模型增量构造规范化工具请求。 */
function makeToolRequest(sessionID: string, toolCall: ModelToolCall): ToolRequest {
  return normalizeHeadlessToolRequest(sessionID, toolCall.name, toolCall.input)
}

/** 兼容旧的单工具增量格式。 */
function legacyToolCall(chunk: ModelChunk): ModelToolCall {
  if (!chunk.toolName) throw new Error("模型返回了缺少名称的工具请求")
  return {
    id: chunk.toolCallID ?? crypto.randomUUID(),
    name: chunk.toolName,
    input: chunk.toolInput ?? {},
  }
}

/** 把模型返回的 Question chunk 转成稳定的 pending 请求。 */
function createQuestionRequest(sessionID: string, chunk: ModelChunk): HeadlessQuestionRequest {
  if (!chunk.toolCallID || !chunk.questions || chunk.questions.length === 0) {
    throw new Error("模型返回了无效的问题请求")
  }
  return {
    id: chunk.questionID ?? crypto.randomUUID(),
    sessionID,
    toolCallID: chunk.toolCallID,
    questions: chunk.questions,
  }
}

/** 兼容 OpenAI Function Calling 返回的 question 工具调用。 */
function toQuestionChunk(chunk: ModelChunk): ModelChunk | undefined {
  if (chunk.type === "question") return chunk
  const toolCall = chunk.toolCalls?.find((item) => item.name === "question")
  if (toolCall)
    return {
      type: "question",
      questionID: toolCall.id,
      toolCallID: toolCall.id,
      questions: readQuestionItems(toolCall.input),
    }
  if (chunk.toolName === "question") {
    return {
      type: "question",
      questionID: chunk.toolCallID,
      toolCallID: chunk.toolCallID,
      questions: readQuestionItems(chunk.toolInput),
    }
  }
  return undefined
}

function readQuestionItems(input: Record<string, unknown> | undefined): readonly HeadlessQuestionItem[] | undefined {
  return Array.isArray(input?.questions) ? (input.questions as HeadlessQuestionItem[]) : undefined
}

/** 把 Question 调用和结果追加到统一消息历史。 */
function appendQuestionResult(
  messages: readonly ModelMessage[],
  request: HeadlessQuestionRequest,
  result: ToolResult,
): ModelMessage[] {
  return [
    ...messages,
    {
      role: "assistant",
      toolCalls: [{ id: request.toolCallID, name: "question", input: { questions: request.questions } }],
    },
    { role: "tool", toolCallID: request.toolCallID, content: result.output },
  ]
}

/** 在模型步骤前按策略压缩消息，并把压缩结果转换为统一消息历史。 */
async function compactMessagesIfNeeded(
  messages: readonly ModelMessage[],
  options: HeadlessCodingLoopOptions,
  publish: (type: string, data?: Record<string, unknown>) => Promise<void>,
): Promise<ModelMessage[]> {
  const compaction = options.contextCompaction
  const threshold = options.compactionThreshold
  if (!compaction || threshold === undefined) return [...messages]
  const estimatedTokens = compaction.estimate(messages)
  if (estimatedTokens < threshold) return [...messages]
  await publish("context.compaction.started", { estimatedTokens })
  return compactWithEvents(compaction, messages, options.compactionKeepRecent ?? 4, publish)
}

/** 执行摘要并把失败转换为可观察的压缩失败事件。 */
async function compactWithEvents(
  compaction: ContextCompactionPort,
  messages: readonly ModelMessage[],
  keepRecent: number,
  publish: (type: string, data?: Record<string, unknown>) => Promise<void>,
): Promise<ModelMessage[]> {
  try {
    const result = await compaction.compact({ messages, keepRecent })
    await publish("context.compaction.completed", {
      summaryLength: result.summary.length,
      keptMessages: result.recentMessages.length,
    })
    return compactedMessages(result)
  } catch (error) {
    await publish("context.compaction.failed", { message: safeErrorMessage(error) })
    throw error
  }
}

/** 把摘要、项目上下文和最近消息合并为下一次模型请求。 */
function compactedMessages(result: ContextCompactionResult): ModelMessage[] {
  return [
    { role: "system", content: `Context summary:\n${result.summary}`, sourceID: "context:summary" },
    ...result.context.map((entry) => ({
      role: "system" as const,
      content: `Project context from ${entry.path}\n${entry.content}`,
      sourceID: entry.sourceID,
    })),
    ...result.recentMessages,
  ]
}

/** 恢复当前项目来源，并按 sourceID 去重。 */
async function restoreProjectContext(
  sessionID: string,
  messages: readonly ModelMessage[],
  projectContext?: ProjectContextPort,
): Promise<ModelMessage[]> {
  if (!projectContext) return [...messages]
  const entries = await projectContext.load(sessionID)
  const existingSourceIDs = new Set(
    messages.flatMap((message) => (message.role === "system" && message.sourceID ? [message.sourceID] : [])),
  )
  const additions = entries
    .filter((entry) => !existingSourceIDs.has(entry.sourceID))
    .map((entry) => ({
      role: "system" as const,
      content: `Project context from ${entry.path}\n${entry.content}`,
      sourceID: entry.sourceID,
    }))
  const firstNonSystemIndex = messages.findIndex((message) => message.role !== "system")
  const insertAt = firstNonSystemIndex === -1 ? messages.length : firstNonSystemIndex
  return [...messages.slice(0, insertAt), ...additions, ...messages.slice(insertAt)]
}

/** 把未知错误转换为可安全发布到事件流的消息。 */
function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Coding Loop 执行失败"
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
  readonly data?: Record<string, unknown>
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

export { createHeadlessToolRegistry, normalizeHeadlessToolRequest } from "./tools.js"
export type { HeadlessToolRegistry, HeadlessToolRegistryOptions, HeadlessBuiltinToolName } from "./tools.js"
export { createHeadlessPermissionBroker, HeadlessPermissionError } from "./permission.js"
export { redactHeadlessSensitiveValue } from "./permission.js"
export type {
  HeadlessPermissionBroker,
  HeadlessPermissionDecision,
  HeadlessPermissionErrorCode,
  HeadlessPermissionReply,
  HeadlessPermissionRequest,
} from "./permission.js"
export { createHeadlessModelConfigStore, HeadlessModelConfigError } from "./model-config.js"
export type {
  HeadlessModelConfig,
  HeadlessModelConfigErrorCode,
  HeadlessModelConfigInput,
  HeadlessModelConfigStore,
} from "./model-config.js"
export { createOpenAICompatibleModelPort, HeadlessModelError } from "./model.js"
export type { HeadlessFetch, HeadlessModelErrorCode, OpenAICompatibleModelPortOptions } from "./model.js"
export { createHeadlessProjectContextPort } from "./context.js"
export type {
  HeadlessQuestionErrorCode,
  HeadlessQuestionItem,
  HeadlessQuestionPort,
  HeadlessQuestionRequest,
  QuestionPort,
  ContextCompactionPort,
  ContextCompactionResult,
  HeadlessProjectContextPortOptions,
  ProjectContextEntry,
  ProjectContextPort,
  ProjectContextSource,
} from "./context.js"
export { createHeadlessQuestionPort, HeadlessQuestionError } from "./context.js"
