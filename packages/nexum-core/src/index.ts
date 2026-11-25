/**
 * Nexum Core 的最小端口契约与组合入口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { basename, isAbsolute, normalize } from "node:path"
import { NexumModelError } from "./model.js"
import type {
  ContextCompactionPort,
  ContextCompactionResult,
  NexumQuestionItem,
  NexumQuestionPort,
  NexumQuestionRequest,
  ProjectContextPort,
} from "./context.js"
import { redactNexumSensitiveValue } from "./permission.js"
export {
  type NexumSkillPackage,
  type NexumSkillCandidate,
  type NexumSkillRegistration,
  type NexumSkillRegistrationStore,
  type NexumSkillRegistry,
  type NexumSkillSource,
  type NexumSkillSourceType,
  type NexumSkillStatus,
  type NexumSkillSummary,
} from "./skill-registry.js"
import type { MessageStore } from "./message-store.js"
import { normalizeNexumToolRequest } from "./tools.js"
import { NexumSkillInvocationError } from "./skill-invocation.js"
import type { NexumSkillInvocationPort } from "./skill-invocation.js"
export {
  NEXUM_DEFAULT_ROLE_PROMPT,
  NexumRolePromptError,
  type NexumRolePrompt,
  type NexumRolePromptSource,
  type NexumRolePromptStore,
} from "./role-prompt.js"
import type { NexumRolePromptStore } from "./role-prompt.js"

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
      readonly reasoningContent?: string
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
  readonly toolChoice?: "auto" | "none"
  readonly signal?: AbortSignal
}

/** 模型生成过程中向 Coding Loop 输出的最小增量。 */
export interface ModelChunk {
  readonly type: "reasoning" | "text" | "tool-call" | "question" | "completed"
  readonly content?: string
  readonly reasoningContent?: string
  readonly toolCallID?: string
  readonly toolName?: string
  readonly toolInput?: Record<string, unknown>
  readonly toolCalls?: readonly ModelToolCall[]
  readonly questionID?: string
  readonly questions?: readonly NexumQuestionItem[]
  readonly finishReason?: string
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
  readonly signal?: AbortSignal
}

/** 工具调用结果。 */
export interface ToolResult {
  readonly ok: boolean
  readonly output: string
  readonly toolCallID?: string
  readonly errorCode?: "timeout" | "cancelled" | "tool_failed"
  readonly status?: "timeout" | "cancelled" | "failed"
}

/** 工具端口负责执行已经通过权限判断的工具调用。 */
export interface ToolPort {
  readonly execute: (request: ToolRequest) => Promise<ToolResult>
}

/** 权限评估结果。 */
export type PermissionEffect = "allow" | "deny" | "ask"

/** 交给观察者的待审批权限请求快照。 */
export interface PermissionRequestSnapshot {
  readonly id: string
  readonly sessionID: string
  readonly action: string
  readonly resource: string
  readonly reason?: string
}

/** 权限端口负责判断工具调用是否可以继续。 */
export interface PermissionPort {
  readonly evaluate: (request: ToolRequest) => Promise<PermissionEffect>
  readonly cancel?: (sessionID: string, requestID?: string) => Promise<void>
  /**
   * 可选能力：注册 pending 请求观察者，返回取消订阅函数。
   *
   * 端口在阻塞等待决策之前调用观察者，Coding Loop 依赖它在 permission.requested
   * 事件中携带真实的 requestID，而不是轮询 pending 列表猜测对应请求。
   */
  readonly observe?: (listener: (request: PermissionRequestSnapshot) => Promise<void> | void) => () => void
}

/** Session 的最小持久化记录。 */
export interface SessionRecord {
  readonly sessionID: string
  readonly name: string
  readonly directory: string
  readonly status: "idle" | "running" | "completed" | "failed" | "cancelled"
  readonly createdAt: string
  readonly updatedAt: string
}

/** Session 存储端口。 */
export interface SessionStore {
  readonly list: () => Promise<readonly SessionRecord[]>
  readonly get: (sessionID: string) => Promise<SessionRecord | undefined>
  readonly save: (session: SessionRecord) => Promise<void>
  readonly delete: (sessionID: string) => Promise<void>
}

/** Nexum Session 的状态类型。 */
export type NexumSessionStatus = SessionRecord["status"]

/** 可由 Nexum Session Service 返回的领域错误类型。 */
export type NexumSessionErrorCode =
  | "invalid_directory"
  | "invalid_name"
  | "session_not_found"
  | "invalid_transition"
  | "session_busy"

/** Nexum Session 创建请求。 */
export interface NexumSessionCreateInput {
  readonly directory: string
  readonly name?: string
}

/** Nexum Session 的可变展示元数据。 */
export interface NexumSessionUpdateInput {
  readonly name: string
}

/** Nexum Session Service 的可替换目录校验端口。 */
export interface NexumDirectoryValidator {
  readonly validate: (directory: string) => Promise<void>
}

/** 可观察和推进 Session 生命周期的最小服务接口。 */
export interface NexumSessionService {
  readonly create: (input: NexumSessionCreateInput) => Promise<SessionRecord>
  readonly list: () => Promise<readonly SessionRecord[]>
  readonly get: (sessionID: string) => Promise<SessionRecord | undefined>
  readonly update: (sessionID: string, input: NexumSessionUpdateInput) => Promise<SessionRecord>
  readonly setStatus: (sessionID: string, status: NexumSessionStatus) => Promise<SessionRecord>
  readonly delete: (sessionID: string, beforeDelete?: () => Promise<void>) => Promise<void>
}

/** Nexum Session Service 的依赖配置。 */
export interface NexumSessionServiceOptions {
  readonly store: SessionStore
  readonly directoryValidator?: NexumDirectoryValidator
  readonly atomicDelete?: (sessionID: string) => Promise<void>
}

/** Session 领域错误，包含稳定的机器可读错误码。 */
export class NexumSessionError extends Error {
  constructor(
    readonly code: NexumSessionErrorCode,
    message: string,
    readonly sessionID?: string,
  ) {
    super(message)
    this.name = "NexumSessionError"
  }
}

/** Coding Loop 运行边界错误。 */
export type NexumRunErrorCode = "timeout" | "not_continuable"

/** Coding Loop 运行边界错误，供 Protocol 映射稳定公共错误。 */
export class NexumRunError extends Error {
  constructor(
    readonly code: NexumRunErrorCode,
    message: string,
    readonly sessionID?: string,
  ) {
    super(message)
    this.name = "NexumRunError"
  }
}

/**
 * 校验 Nexum Session 的工作目录。
 *
 * @param directory - 待校验的绝对工作目录
 * @throws 当目录不是绝对路径、不存在、不是目录或不可读写时抛出领域错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export async function validateNexumDirectory(directory: string): Promise<void> {
  const trimmed = directory.trim()
  if (!trimmed) {
    throw new NexumSessionError("invalid_directory", "工作目录不能为空")
  }
  const normalized = normalize(trimmed)
  if (!isAbsolute(normalized)) {
    throw new NexumSessionError("invalid_directory", "工作目录必须是绝对路径")
  }

}

/**
 * 创建独立 Nexum Session Service。
 *
 * @param options - SessionStore 与目录校验器
 * @returns 负责创建和管理 Session 状态的服务
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createNexumSessionService(options: NexumSessionServiceOptions): NexumSessionService {
  const store = options.store
  const directoryValidator = options.directoryValidator ?? { validate: validateNexumDirectory }
  const sessionQueues = new Map<string, Promise<void>>()

  const enqueueSessionOperation = <T>(sessionID: string, operation: () => Promise<T>): Promise<T> => {
    const previous = sessionQueues.get(sessionID) ?? Promise.resolve()
    const current = previous.then(operation, operation)
    const settled = current.then(
      () => undefined,
      () => undefined,
    )
    sessionQueues.set(sessionID, settled)
    void settled.then(() => {
      if (sessionQueues.get(sessionID) === settled) sessionQueues.delete(sessionID)
    })
    return current
  }

  return {
    async create(input) {
      const trimmedDirectory = input.directory.trim()
      if (!trimmedDirectory) throw new NexumSessionError("invalid_directory", "工作目录不能为空")
      const directory = normalize(trimmedDirectory)
      await directoryValidator.validate(directory)
      const name = normalizeSessionName(input.name, directory)
      const timestamp = new Date().toISOString()
      const session: SessionRecord = {
        sessionID: crypto.randomUUID(),
        name,
        directory,
        status: "idle",
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await store.save(session)
      return session
    },
    list() {
      return store.list()
    },
    get(sessionID) {
      return store.get(sessionID)
    },
    update(sessionID, input) {
      return enqueueSessionOperation(sessionID, async () => {
        const current = await store.get(sessionID)
        if (!current) {
          throw new NexumSessionError("session_not_found", "Session 不存在", sessionID)
        }
        const name = requireSessionName(input.name)
        const next = { ...current, name, updatedAt: nextSessionTimestamp(current.updatedAt) }
        await store.save(next)
        return next
      })
    },
    setStatus(sessionID, status) {
      return enqueueSessionOperation(sessionID, async () => {
        const current = await store.get(sessionID)
        if (!current) {
          throw new NexumSessionError("session_not_found", "Session 不存在", sessionID)
        }
        if (current.status === status) return current
        if (!isAllowedTransition(current.status, status)) {
          throw new NexumSessionError(
            "invalid_transition",
            `Session 状态不能从 ${current.status} 变更为 ${status}`,
            sessionID,
          )
        }
        const next = { ...current, status, updatedAt: nextSessionTimestamp(current.updatedAt) }
        await store.save(next)
        return next
      })
    },
    delete(sessionID, beforeDelete) {
      return enqueueSessionOperation(sessionID, async () => {
        const current = await store.get(sessionID)
        if (!current) {
          throw new NexumSessionError("session_not_found", "Session 不存在", sessionID)
        }
        if (current.status === "running") {
          throw new NexumSessionError("session_busy", "Session 当前正在运行", sessionID)
        }
        if (options.atomicDelete) {
          await options.atomicDelete(sessionID)
          return
        }
        await beforeDelete?.()
        await store.delete(sessionID)
      })
    },
  }
}

function normalizeSessionName(name: string | undefined, directory: string): string {
  const candidate = name?.trim() || basename(directory)
  if (!candidate) {
    throw new NexumSessionError("invalid_name", "Session 名称不能为空")
  }
  return candidate
}

function requireSessionName(name: string): string {
  const candidate = name.trim()
  if (!candidate) {
    throw new NexumSessionError("invalid_name", "Session 名称不能为空")
  }
  return candidate
}

function nextSessionTimestamp(previous: string): string {
  const current = Date.now()
  const previousTime = Date.parse(previous)
  return new Date(Math.max(current, Number.isNaN(previousTime) ? current : previousTime + 1)).toISOString()
}

/** Coding Loop 的一次 Prompt 输入。 */
export interface NexumCodingLoopInput {
  readonly sessionID: string
  readonly text: string
}

/** Coding Loop 的可替换运行依赖。 */
export interface NexumCodingLoopOptions {
  readonly model: ModelPort
  readonly tool: ToolPort
  readonly permission: PermissionPort
  readonly sessions: NexumSessionService
  readonly events: EventSink
  readonly messageStore: MessageStore
  readonly tools?: readonly ModelToolDefinition[]
  readonly contextCompaction?: ContextCompactionPort
  readonly projectContext?: ProjectContextPort
  readonly question?: NexumQuestionPort
  readonly skills?: NexumSkillInvocationPort
  /** 每次模型调用前临时注入的默认角色提示词，不写入 Session 历史。 */
  readonly rolePrompt?: NexumRolePromptStore
  readonly compactionThreshold?: number
  readonly compactionKeepRecent?: number
  readonly maxSteps?: number
  readonly maxModelRetries?: number
  readonly retryDelayMs?: number
  readonly maxRetryDelayMs?: number
  /** 单次模型增量等待的最大毫秒数；0 或省略表示不启用该边界。 */
  readonly modelTimeoutMs?: number
  /** 单次工具执行等待的最大毫秒数；省略使用安全默认值，0 表示关闭该边界。 */
  readonly toolTimeoutMs?: number
  /** 一次 Coding Loop 运行的总最大毫秒数；0 或省略表示不启用该边界。 */
  readonly runTimeoutMs?: number
  /** 模型无增量输出时仍向交互层发送思考心跳；设为 0 可关闭。 */
  readonly thinkingHeartbeatMs?: number
  readonly maxOutputContinuations?: number
}

/** 单 Agent Nexum Coding Loop。 */
export interface NexumCodingLoop {
  readonly run: (input: NexumCodingLoopInput) => Promise<SessionRecord>
  readonly start?: (input: NexumCodingLoopInput) => NexumCodingLoopStart
  readonly canContinue?: (sessionID: string) => Promise<boolean>
  readonly continueStart?: (sessionID: string) => Promise<NexumCodingLoopContinueStart>
  readonly continue?: (sessionID: string) => Promise<SessionRecord>
  readonly cancel: (sessionID: string) => Promise<SessionRecord>
}

type NexumCodingLoopExecutionInput = NexumCodingLoopInput | { readonly sessionID: string; readonly mode: "continue" }

/** 用于在 HTTP admission 与异步执行之间保持同一 Session 的运行占用。 */
export type NexumCodingLoopStart =
  | { readonly accepted: true; readonly admission: Promise<SessionRecord>; readonly promise: Promise<SessionRecord> }
  | { readonly accepted: false }

/**
 * Continue admission 的稳定失败原因。
 */
export type NexumCodingLoopContinueStart =
  | { readonly accepted: true; readonly admission: Promise<SessionRecord>; readonly promise: Promise<SessionRecord> }
  | { readonly accepted: false; readonly reason: "session_busy" | "not_continuable" }

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
export function createNexumCodingLoop(options: NexumCodingLoopOptions): NexumCodingLoop {
  const maxSteps = options.maxSteps
  const maxOutputContinuations = Math.max(1, options.maxOutputContinuations ?? 8)
  const toolTimeoutMs = options.toolTimeoutMs === 0 ? undefined : normalizeTimeout(options.toolTimeoutMs) ?? DEFAULT_TOOL_TIMEOUT_MS
  const messageStore = options.messageStore
  const activeRuns = new Map<string, ActiveRun>()
  const continuationAdmissions = new Set<string>()
  const sessionSequences = new Map<string, number>()
  const sessionSequenceSeeds = new Map<string, Promise<void>>()

  /**
   * 首次为 Session 发布事件前读取 EventSink 已有的最后序号，跨服务重启延续编号。
   *
   * 同一 Session 只读取一次，并发调用共享同一 Promise 并保持同步递增的原子性。
   *
   * @param sessionID - 目标 Session
   * @returns 读取完成的 Promise
   * @author lvdaxianer@yeah.net
   * @date 2026-11-22
   */
  const seedSessionSequence = (sessionID: string): Promise<void> => {
    const seeded = sessionSequenceSeeds.get(sessionID)
    if (seeded) return seeded
    const seed = Promise.resolve(options.events.lastSequence?.(sessionID)).then((lastSequence) => {
      if (typeof lastSequence !== "number" || !Number.isFinite(lastSequence)) return
      if (lastSequence > (sessionSequences.get(sessionID) ?? 0)) sessionSequences.set(sessionID, lastSequence)
    })
    sessionSequenceSeeds.set(sessionID, seed)
    return seed
  }

  const execute = async (input: NexumCodingLoopExecutionInput, runState: ActiveRun) => {
    const session = await options.sessions.get(input.sessionID).catch((error) => {
      if (activeRuns.get(input.sessionID) === runState) activeRuns.delete(input.sessionID)
      throw error
    })
    if (!session) {
      if (activeRuns.get(input.sessionID) === runState) activeRuns.delete(input.sessionID)
      throw new NexumSessionError("session_not_found", "Session 不存在", input.sessionID)
    }

    const history = await messageStore.load(input.sessionID)
    const continuation = "mode" in input && input.mode === "continue"
    const lastMessage = history.at(-1)
    if (continuation && (!lastMessage || (lastMessage.role !== "user" && lastMessage.role !== "tool"))) {
      throw new NexumRunError("not_continuable", "Session 没有可继续的上下文", input.sessionID)
    }
    const promptText = "mode" in input ? (lastMessage?.content ?? "") : input.text
    if (continuation && !promptText.trim()) {
      throw new NexumRunError("not_continuable", "Session 没有可继续的上下文", input.sessionID)
    }

    const runID = crypto.randomUUID()
    let settled = false
    const publish = async (type: string, data?: Record<string, unknown>) => {
      await seedSessionSequence(input.sessionID)
      const sequence = (sessionSequences.get(input.sessionID) ?? 0) + 1
      sessionSequences.set(input.sessionID, sequence)
      await options.events.publish({
        eventID: crypto.randomUUID(),
        runID,
        sessionID: input.sessionID,
        type,
        sequence,
        occurredAt: new Date().toISOString(),
        data,
      })
    }
    const publishSettled = async (result: "completed" | "failed" | "cancelled") => {
      if (settled) return
      settled = true
      await publish("run.settled", { result })
    }
    const publishTerminalEvents = async (
      type: string,
      data: Record<string, unknown> | undefined,
      result: "completed" | "failed" | "cancelled",
    ) => {
      const sessionEvent = await publish(type, data).then(
        () => ({ ok: true as const }),
        (error) => ({ ok: false as const, error }),
      )
      const settledEvent = await publishSettled(result).then(
        () => ({ ok: true as const }),
        (error) => ({ ok: false as const, error }),
      )
      if (!sessionEvent.ok) return sessionEvent
      return settledEvent
    }
    // canonicalHistory 只保存需要跨 Prompt 恢复的消息；modelMessages 在其基础上临时注入 skill 与项目上下文。
    let canonicalHistory: ModelMessage[] = continuation ? [...history] : [...history, { role: "user", content: promptText }]
    let modelMessages: ModelMessage[] = [...canonicalHistory]
    let skillSystemMessages: readonly ModelMessage[] = []
    const temporarySourceIDs = new Set<string>()
    let prompt: ModelPrompt = { sessionID: input.sessionID, text: promptText, messages: modelMessages }
    const persist = () => messageStore.save(input.sessionID, canonicalHistory)
    const appendCanonical = (added: readonly ModelMessage[]) => {
      canonicalHistory = [...canonicalHistory, ...added]
      modelMessages = [...modelMessages, ...added]
    }
    /** 只用于本轮模型请求：临时注入 skill 与项目上下文，不影响落盘历史。 */
    const injectTemporaryContext = async (history: readonly ModelMessage[]): Promise<ModelMessage[]> => {
      const rolePrompt = options.rolePrompt ? await options.rolePrompt.get() : undefined
      const roleSystemMessages = rolePrompt
        ? [{ role: "system" as const, content: rolePrompt.prompt, sourceID: "runtime:default-role" }]
        : []
      for (const message of roleSystemMessages) {
        if (message.sourceID) temporarySourceIDs.add(message.sourceID)
      }
      for (const message of skillSystemMessages) {
        if (message.role === "system" && message.sourceID) temporarySourceIDs.add(message.sourceID)
      }
      const withTemporarySystemMessages = insertSystemMessages([...roleSystemMessages, ...skillSystemMessages], history)
      return restoreProjectContext(input.sessionID, withTemporarySystemMessages, options.projectContext, publish, temporarySourceIDs)
    }

    try {
      // 用户输入先进入 canonical 历史并立即落盘，避免后续临时注入污染历史。
      if (!continuation) await persist()
      const skillPrompt = options.skills
        ? await options.skills.resolve({ sessionID: input.sessionID, text: promptText })
        : { skills: [], systemMessages: [] }
      for (const skill of skillPrompt.skills) {
        await publish("skill.activated", {
          skillID: skill.id,
          name: skill.name,
          mention: skill.mention,
        })
      }
      skillSystemMessages = skillPrompt.systemMessages
      modelMessages = await injectTemporaryContext(canonicalHistory)
      prompt = {
        sessionID: input.sessionID,
        text: promptText,
        messages: modelMessages,
        ...(options.tools ? { tools: options.tools } : {}),
      }
      let step = 0
      let outputContinuations = 0
      while (true) {
        throwIfCancelled(runState)
        const finalizing = maxSteps !== undefined && step >= maxSteps
        if (finalizing) await publish("coding-loop.limit.reached", { maxSteps })
        const compaction = await compactMessagesIfNeeded(modelMessages, options, publish)
        if (compaction.compacted) {
          // 压缩产生的 summary 属于需要保留的 canonical system 消息，临时注入的 skill/项目上下文不落盘。
          canonicalHistory = canonicalizeCompactedHistory(compaction.messages, temporarySourceIDs)
          await persist()
          modelMessages = await injectTemporaryContext(canonicalHistory)
        }
        prompt = {
          ...prompt,
          text: finalizing ? MAX_STEPS_PROMPT : promptText,
          messages: finalizing
            ? [...modelMessages, { role: "user", content: MAX_STEPS_PROMPT }]
            : modelMessages,
          ...(finalizing
            ? { tools: [], toolChoice: "none" as const }
            : options.tools
              ? { tools: options.tools, toolChoice: "auto" as const }
              : {}),
        }
        let continued = false
        let assistantText = ""
        let assistantReasoning: string | undefined
        let overflowCompacted = false
        let modelFinished = false
        while (!modelFinished) {
          const stopThinkingHeartbeat = startThinkingHeartbeat(publish, options.thinkingHeartbeatMs)
          try {
            for await (const chunk of promptWithRetry(options.model, prompt, runState, options, publish)) {
              throwIfCancelled(runState)
              if (chunk.type === "reasoning") {
                const content = chunk.reasoningContent ?? ""
                assistantReasoning = `${assistantReasoning ?? ""}${content}`
                if (content) await publish("assistant.reasoning", { content })
                continue
              }
              if (chunk.reasoningContent !== undefined) assistantReasoning = chunk.reasoningContent
              if (chunk.type === "text") {
                assistantText += chunk.content ?? ""
                await publish("assistant.text", { content: chunk.content ?? "" })
                continue
              }
              if (chunk.type === "completed") {
                if (chunk.finishReason === "length" && !finalizing && outputContinuations < maxOutputContinuations) {
                  outputContinuations += 1
                  appendCanonical(appendAssistantMessage([], assistantText, assistantReasoning))
                  appendCanonical([{ role: "user", content: OUTPUT_CONTINUATION_PROMPT }])
                  await persist()
                  prompt = {
                    sessionID: input.sessionID,
                    text: OUTPUT_CONTINUATION_PROMPT,
                    messages: modelMessages,
                    ...(options.tools ? { tools: options.tools, toolChoice: "auto" as const } : {}),
                  }
                  continued = true
                  break
                }
                appendCanonical(appendAssistantMessage([], assistantText, assistantReasoning))
                await persist()
                await publishTerminalEvents("session.completed", undefined, "completed")
                const completed = await options.sessions.setStatus(input.sessionID, "completed")
                return completed
              }

              if (finalizing) {
                appendCanonical(appendAssistantMessage([], assistantText, assistantReasoning))
                await persist()
                await publishTerminalEvents("session.completed", undefined, "completed")
                const completed = await options.sessions.setStatus(input.sessionID, "completed")
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
                appendCanonical(appendQuestionResult([], request, result, assistantText, assistantReasoning))
                await persist()
                prompt = {
                  sessionID: input.sessionID,
                  text: promptText,
                  toolResults: [result],
                  messages: modelMessages,
                  ...(options.tools ? { tools: options.tools, toolChoice: "auto" as const } : {}),
                }
                continued = true
                break
              }

              const toolCalls = chunk.toolCalls ?? [legacyToolCall(chunk)]
              appendCanonical([
                {
                  role: "assistant",
                  ...(assistantText ? { content: assistantText } : {}),
                  ...(assistantReasoning !== undefined ? { reasoningContent: assistantReasoning } : {}),
                  toolCalls,
                },
              ])
              const toolResults: ToolResult[] = []
              for (const toolCall of toolCalls) {
                const request = makeToolRequest(input.sessionID, toolCall, runState.controller.signal)
                const toolCallID = toolCall.id
                await publish("tool.request", {
                  toolCallID,
                  action: request.action,
                  resource: redactNexumSensitiveValue(request.resource) as string,
                  toolName: request.toolName,
                  input: redactNexumSensitiveValue(request.input) as Record<string, unknown>,
                })
                // pending 请求由权限端口主动通知，保证 permission.requested 先于阻塞等待发布。
                const stopObserving = options.permission.observe?.((pending) => {
                  if (pending.sessionID !== request.sessionID || pending.action !== request.action) return
                  return publish("permission.requested", {
                    requestID: pending.id,
                    action: pending.action,
                    resource: pending.resource,
                    reason: pending.reason,
                  })
                })
                let effect: PermissionEffect
                try {
                  effect = await options.permission.evaluate(request)
                } finally {
                  stopObserving?.()
                }
                if (effect !== "allow") {
                  throw new Error(effect === "deny" ? "工具请求被拒绝" : "工具请求需要权限审批")
                }
                const toolController = new AbortController()
                const abortTool = () => toolController.abort()
                runState.controller.signal.addEventListener("abort", abortTool, { once: true })
                let result: ToolResult
                try {
                  result = await waitForAbortable(
                    options.tool.execute({ ...request, signal: toolController.signal }),
                    runState.controller.signal,
                    toolTimeoutMs,
                    new NexumRunError("timeout", "工具执行超时", input.sessionID),
                    abortTool,
                  )
                } catch (error) {
                  const timedOut = runState.timedOut || (error instanceof NexumRunError && error.code === "timeout")
                  const cancelled = !timedOut && (error instanceof NexumCancellationError || runState.cancelled || runState.controller.signal.aborted)
                  await publish("tool.result", {
                    toolCallID,
                    ok: false,
                    errorCode: timedOut ? "timeout" : cancelled ? "cancelled" : "tool_failed",
                    status: timedOut ? "timeout" : cancelled ? "cancelled" : "failed",
                    output: cancelled ? "工具执行已取消" : timedOut ? "工具执行超时" : safeErrorMessage(error),
                  })
                  throw error
                } finally {
                  runState.controller.signal.removeEventListener("abort", abortTool)
                }
                const toolResult = { ...result, toolCallID }
                toolResults.push(toolResult)
                await publish("tool.result", {
                  toolCallID,
                  ok: result.ok,
                  output: redactNexumSensitiveValue(result.output) as string,
                  ...(result.errorCode ? { errorCode: result.errorCode } : {}),
                  ...(result.status ? { status: result.status } : {}),
                })
                appendCanonical([{ role: "tool", toolCallID, content: result.output }])
                if (result.status === "timeout") throw new NexumRunError("timeout", "工具执行超时", input.sessionID)
                if (result.status === "cancelled") throw new NexumCancellationError()
              }
              await persist()
              prompt = {
                sessionID: input.sessionID,
                text: promptText,
                toolResults,
                messages: modelMessages,
                ...(options.tools ? { tools: options.tools, toolChoice: "auto" as const } : {}),
              }
              continued = true
              break
            }
            modelFinished = true
          } catch (error) {
            if (!isContextOverflowError(error) || overflowCompacted || !options.contextCompaction) throw error
            overflowCompacted = true
            const recovered = await compactMessagesIfNeeded(modelMessages, options, publish, true)
            if (!recovered.compacted) throw error
            canonicalHistory = canonicalizeCompactedHistory(recovered.messages, temporarySourceIDs)
            await persist()
            modelMessages = await injectTemporaryContext(canonicalHistory)
            prompt = {
              ...prompt,
              messages: finalizing
                ? [...modelMessages, { role: "user", content: MAX_STEPS_PROMPT }]
                : modelMessages,
            }
            assistantText = ""
            assistantReasoning = undefined
          } finally {
            stopThinkingHeartbeat()
          }
        }

        step += 1
        if (continued) continue
        appendCanonical(appendAssistantMessage([], assistantText, assistantReasoning))
        await persist()
        await publishTerminalEvents("session.completed", undefined, "completed")
        const completed = await options.sessions.setStatus(input.sessionID, "completed")
        return completed
      }
    } catch (error) {
      if (error instanceof NexumSkillInvocationError) {
        await publish("skill.failed", { skillID: error.skillID, code: error.code })
      }
      if (!runState.timedOut && (runState.cancelled || runState.controller.signal.aborted || error instanceof NexumCancellationError)) {
        const current = await options.sessions.get(input.sessionID)
        await publishTerminalEvents("session.cancelled", undefined, "cancelled")
        const cancelled = current?.status === "cancelled" ? current : await options.sessions.setStatus(input.sessionID, "cancelled")
        return cancelled
      }
      await publishTerminalEvents("session.failed", { message: safeErrorMessage(error) }, "failed")
      await options.sessions.setStatus(input.sessionID, "failed")
      throw error
    } finally {
      if (runState.timeoutTimer) clearTimeout(runState.timeoutTimer)
      if (activeRuns.get(input.sessionID) === runState) activeRuns.delete(input.sessionID)
    }
  }
  const canContinue = async (sessionID: string) => {
    const history = await messageStore.load(sessionID)
    const lastMessage = history.at(-1)
    return Boolean(lastMessage && (lastMessage.role === "user" || lastMessage.role === "tool") && lastMessage.content.trim())
  }
  const start = (input: NexumCodingLoopExecutionInput): NexumCodingLoopStart => {
    if (activeRuns.has(input.sessionID)) return { accepted: false }
    const runState: ActiveRun = {
      controller: new AbortController(),
      cancelled: false,
      timedOut: false,
    }
    const timeoutMs = normalizeTimeout(options.runTimeoutMs)
    if (timeoutMs !== undefined) {
      runState.timeoutTimer = setTimeout(() => {
        runState.timedOut = true
        runState.controller.abort()
      }, timeoutMs)
    }
    activeRuns.set(input.sessionID, runState)
    const admission = options.sessions.setStatus(input.sessionID, "running")
    const promise = admission.then(() => execute(input, runState))
    runState.promise = promise
    const cleanup = () => {
      if (runState.timeoutTimer) clearTimeout(runState.timeoutTimer)
      if (activeRuns.get(input.sessionID) === runState) activeRuns.delete(input.sessionID)
    }
    void promise.then(cleanup, cleanup)
    return { accepted: true, admission, promise }
  }

  return {
    start(input) {
      return start(input)
    },
    run(input) {
      const started = start(input)
      if (!started.accepted) {
        return Promise.reject(new NexumSessionError("session_busy", "Session 当前正在运行", input.sessionID))
      }
      return started.promise
    },
    canContinue,
    async continueStart(sessionID) {
      if (activeRuns.has(sessionID) || continuationAdmissions.has(sessionID)) {
        return { accepted: false, reason: "session_busy" }
      }
      continuationAdmissions.add(sessionID)
      try {
        if (!(await canContinue(sessionID))) return { accepted: false, reason: "not_continuable" }
        const started = start({ sessionID, mode: "continue" })
        if (!started.accepted) return { accepted: false, reason: "session_busy" }
        return started
      } finally {
        continuationAdmissions.delete(sessionID)
      }
    },
    continue(sessionID) {
      return this.continueStart!(sessionID).then((started) => {
        if (started.accepted) return started.promise
        if (started.reason === "not_continuable") {
          return Promise.reject(new NexumRunError("not_continuable", "Session 没有可继续的上下文", sessionID))
        }
        return Promise.reject(new NexumSessionError("session_busy", "Session 当前正在运行", sessionID))
      })
    },
    async cancel(sessionID) {
      const current = await options.sessions.get(sessionID)
      if (!current) {
        throw new NexumSessionError("session_not_found", "Session 不存在", sessionID)
      }
      const active = activeRuns.get(sessionID)
      if (active) {
        active.cancelled = true
        active.controller.abort()
        await options.permission.cancel?.(sessionID)
        await active.promise?.catch(() => undefined)
      }
      const latest = await options.sessions.get(sessionID)
      if (!latest) {
        throw new NexumSessionError("session_not_found", "Session 不存在", sessionID)
      }
      if (latest.status === "idle" || latest.status === "running") {
        return options.sessions.setStatus(sessionID, "cancelled")
      }
      return latest
    },
  }
}

interface ActiveRun {
  readonly controller: AbortController
  promise?: Promise<SessionRecord>
  cancelled: boolean
  timedOut: boolean
  timeoutTimer?: ReturnType<typeof setTimeout>
}

/** Coding Loop 内部取消控制流错误。 */
class NexumCancellationError extends Error {
  constructor() {
    super("Coding Loop 已取消")
    this.name = "NexumCancellationError"
  }
}

/** 将有限的超时配置归一化为可安全传给定时器的毫秒数。 */
function normalizeTimeout(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.floor(value))
}

/** 在完成、取消或超时之间等待一个外部 Promise。 */
function waitForAbortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number | undefined,
  timeoutError?: Error,
  onTimeout?: () => void,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new NexumCancellationError())
  const timeout = normalizeTimeout(timeoutMs)
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new NexumCancellationError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    if (timeout !== undefined) {
      timer = setTimeout(() => {
        onTimeout?.()
        cleanup()
        reject(timeoutError ?? new NexumRunError("timeout", "运行超时"))
      }, timeout)
    }
    void promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}

/** 为模型流的每次 next 增加可取消的空闲等待边界。 */
async function* readModelWithTimeout(
  source: AsyncIterable<ModelChunk>,
  runState: ActiveRun,
  timeoutMs: number | undefined,
): AsyncGenerator<ModelChunk, void> {
  const iterator = source[Symbol.asyncIterator]()
  try {
    while (true) {
      const next = await waitForAbortable(
        iterator.next(),
        runState.controller.signal,
        timeoutMs,
        new NexumModelError("timeout", "模型响应超时"),
      )
      if (next.done) return
      yield next.value
    }
  } finally {
    const closing = iterator.return?.()
    if (closing) void closing.catch(() => {})
  }
}

const MAX_STEPS_PROMPT =
  "工具步骤预算已用尽。请基于当前上下文直接给出清晰、完整的阶段性结果和下一步建议，不要再调用工具。"
const OUTPUT_CONTINUATION_PROMPT = "上一条回答因输出长度限制被截断，请从中断处继续，不要重复已经输出的内容。"
const DEFAULT_MAX_RETRY_DELAY_MS = 4_000
const DEFAULT_TOOL_TIMEOUT_MS = 120_000
const RETRYABLE_MODEL_ERROR_CODES = new Set([
  "network_error",
  "timeout",
  "rate_limited",
  "upstream_error",
  "unavailable",
])

function startThinkingHeartbeat(
  publish: (type: string, data?: Record<string, unknown>) => Promise<void>,
  intervalMs = 5000,
): () => void {
  const normalizedInterval = Math.max(0, intervalMs)
  if (normalizedInterval === 0) return () => {}
  const startedAt = Date.now()
  let publishing = false
  const timer = setInterval(() => {
    if (publishing) return
    publishing = true
    void publish("assistant.thinking", {
      message: "模型正在思考",
      elapsedMs: Date.now() - startedAt,
    }).finally(() => {
      publishing = false
    })
  }, normalizedInterval)
  return () => clearInterval(timer)
}

/**
 * 在没有可见输出时重试短暂的模型传输失败。
 *
 * @param model - 模型端口
 * @param prompt - 本次模型请求
 * @param runState - 当前 Session 的取消状态
 * @param options - 重试策略配置
 * @param publish - 运行事件发布器
 * @returns 可继续消费的模型增量
 */
async function* promptWithRetry(
  model: ModelPort,
  prompt: ModelPrompt,
  runState: ActiveRun,
  options: NexumCodingLoopOptions,
  publish: (type: string, data?: Record<string, unknown>) => Promise<void>,
): AsyncGenerator<ModelChunk, void> {
  const maxRetries = Math.max(0, options.maxModelRetries ?? 2)
  const baseDelay = Math.max(0, options.retryDelayMs ?? 250)
  const maxDelay = Math.max(0, options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS)
  let retryCount = 0
  while (true) {
    let yielded = false
    try {
      throwIfCancelled(runState)
      await publish("model.attempt", { attempt: retryCount + 1, maxRetries })
      for await (const chunk of readModelWithTimeout(
        model.prompt({ ...prompt, signal: runState.controller.signal }),
        runState,
        options.modelTimeoutMs,
      )) {
        yielded = true
        yield chunk
      }
      return
    } catch (error) {
      throwIfCancelled(runState)
      if (yielded || !isRetryableModelError(error) || retryCount >= maxRetries) throw error
      retryCount += 1
      const delayMs = calculateRetryDelay(baseDelay, retryCount, error, maxDelay)
      await publish("model.retry", {
        attempt: retryCount,
        maxRetries,
        delayMs,
        willRetry: true,
        ...(error instanceof NexumModelError ? { errorCode: error.code } : {}),
      })
      if (delayMs > 0) {
        await waitForAbortable(
          new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
          runState.controller.signal,
          undefined,
        )
      }
      throwIfCancelled(runState)
    }
  }
}

/**
 * 只对可恢复的模型服务不可用重试，认证和协议错误直接交给上层处理。
 *
 * @param error - 模型端口抛出的错误
 * @returns 是否允许自动重试
 */
function isRetryableModelError(error: unknown): boolean {
  if (!(error instanceof NexumModelError)) return false
  return RETRYABLE_MODEL_ERROR_CODES.has(error.code)
}

/**
 * 判断模型是否拒绝了当前消息上下文的大小。
 *
 * @param error - 模型端口抛出的错误
 * @returns 是否需要先压缩上下文
 */
function isContextOverflowError(error: unknown): boolean {
  return error instanceof NexumModelError && error.code === "context_overflow"
}

/**
 * 使用指数退避和抖动避免多个请求同时重试。
 *
 * @param baseDelay - 基础等待时间
 * @param attempt - 当前重试次数
 * @returns 本次等待时间
 */
function calculateRetryDelay(baseDelay: number, attempt: number, error: unknown, maxDelay: number): number {
  if (maxDelay === 0) return 0
  if (error instanceof NexumModelError && error.details.retryAfterMs !== undefined) {
    return Math.min(maxDelay, Math.max(0, error.details.retryAfterMs))
  }
  if (baseDelay === 0) return 0
  const exponential = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1))
  return Math.min(maxDelay, Math.floor(exponential * (0.75 + Math.random() * 0.5)))
}

/** 在模型或工具边界检查取消信号。 */
function throwIfCancelled(run: ActiveRun): void {
  if (run.timedOut) throw new NexumRunError("timeout", "Coding Loop 运行超时")
  if (run.cancelled || run.controller.signal.aborted) throw new NexumCancellationError()
}

/** 从模型增量构造规范化工具请求。 */
function makeToolRequest(sessionID: string, toolCall: ModelToolCall, signal?: AbortSignal): ToolRequest {
  return normalizeNexumToolRequest(sessionID, toolCall.name, toolCall.input, signal)
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
function createQuestionRequest(sessionID: string, chunk: ModelChunk): NexumQuestionRequest {
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

function readQuestionItems(input: Record<string, unknown> | undefined): readonly NexumQuestionItem[] | undefined {
  return Array.isArray(input?.questions) ? (input.questions as NexumQuestionItem[]) : undefined
}

/** 把 Question 调用和结果追加到统一消息历史。 */
function appendQuestionResult(
  messages: readonly ModelMessage[],
  request: NexumQuestionRequest,
  result: ToolResult,
  text?: string,
  reasoningContent?: string,
): ModelMessage[] {
  return [
    ...messages,
    {
      role: "assistant",
      ...(text ? { content: text } : {}),
      ...(reasoningContent !== undefined ? { reasoningContent } : {}),
      toolCalls: [{ id: request.toolCallID, name: "question", input: { questions: request.questions } }],
    },
    { role: "tool", toolCallID: request.toolCallID, content: result.output },
  ]
}

/** 把本轮 assistant 文本增量固化为一条 canonical assistant 消息。 */
function appendAssistantMessage(
  messages: readonly ModelMessage[],
  text: string,
  reasoningContent?: string,
): ModelMessage[] {
  if (!text && reasoningContent === undefined) return [...messages]
  return [
    ...messages,
    {
      role: "assistant",
      ...(text ? { content: text } : {}),
      ...(reasoningContent !== undefined ? { reasoningContent } : {}),
    },
  ]
}

/** 在模型步骤前按策略压缩消息，并把压缩结果转换为统一消息历史。 */
async function compactMessagesIfNeeded(
  messages: readonly ModelMessage[],
  options: NexumCodingLoopOptions,
  publish: (type: string, data?: Record<string, unknown>) => Promise<void>,
  force = false,
): Promise<{ messages: ModelMessage[]; compacted: boolean }> {
  const compaction = options.contextCompaction
  const threshold = options.compactionThreshold
  if (!compaction || (!force && threshold === undefined)) return { messages: [...messages], compacted: false }
  const estimatedTokens = compaction.estimate(messages)
  if (!force && threshold !== undefined && estimatedTokens < threshold) {
    return { messages: [...messages], compacted: false }
  }
  await publish("context.compaction.started", { estimatedTokens, ...(force ? { reason: "context_overflow" } : {}) })
  const compacted = await compactWithEvents(compaction, messages, options.compactionKeepRecent ?? 4, publish)
  return { messages: compacted, compacted: true }
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

/** 把本轮临时系统消息放到历史之前，并按 sourceID 去重。 */
function insertSystemMessages(
  systemMessages: readonly ModelMessage[],
  messages: readonly ModelMessage[],
): ModelMessage[] {
  if (systemMessages.length === 0) return [...messages]
  const existingSourceIDs = new Set(
    messages.flatMap((message) => (message.role === "system" && message.sourceID ? [message.sourceID] : [])),
  )
  const additions = systemMessages.filter(
    (message) => !(message.role === "system" && message.sourceID && existingSourceIDs.has(message.sourceID)),
  )
  if (additions.length === 0) return [...messages]
  return [...additions, ...messages]
}

/**
 * 从压缩结果中提取 canonical 历史。
 *
 * 临时注入的 Skill/项目上下文不落盘；同一 sourceID 的 canonical system 消息
 * 只保留第一次出现，避免每轮压缩重复新增 summary。
 */
function canonicalizeCompactedHistory(
  messages: readonly ModelMessage[],
  temporarySourceIDs: ReadonlySet<string>,
): ModelMessage[] {
  const seenSourceIDs = new Set<string>()
  const canonical: ModelMessage[] = []
  for (const message of messages) {
    if (message.role !== "system" || !message.sourceID) {
      canonical.push(message)
      continue
    }
    if (temporarySourceIDs.has(message.sourceID) || seenSourceIDs.has(message.sourceID)) continue
    seenSourceIDs.add(message.sourceID)
    canonical.push(message)
  }
  return canonical
}

/** 恢复当前项目来源，并按 sourceID 去重；injectedSourceIDs 记录本轮临时注入的来源。 */
async function restoreProjectContext(
  sessionID: string,
  messages: readonly ModelMessage[],
  projectContext?: ProjectContextPort,
  publish?: (type: string, data?: Record<string, unknown>) => Promise<void>,
  injectedSourceIDs?: Set<string>,
): Promise<ModelMessage[]> {
  if (!projectContext) return [...messages]
  const entries = await projectContext.load(sessionID)
  for (const entry of entries) injectedSourceIDs?.add(entry.sourceID)
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
  if (additions.length > 0) {
    await publish?.("context.project.loaded", {
      sources: entries.map(({ sourceID, kind, path }) => ({ sourceID, kind, path })),
    })
  }
  const firstNonSystemIndex = messages.findIndex((message) => message.role !== "system")
  const insertAt = firstNonSystemIndex === -1 ? messages.length : firstNonSystemIndex
  return [...messages.slice(0, insertAt), ...additions, ...messages.slice(insertAt)]
}

/** 把未知错误转换为可安全发布到事件流的消息。 */
function safeErrorMessage(error: unknown): string {
  if (error instanceof NexumModelError) {
    return {
      not_configured: "模型尚未配置",
      authentication_failed: "模型认证失败",
      network_error: "模型网络错误",
      timeout: "模型响应超时",
      rate_limited: "模型请求受限",
      upstream_error: "模型上游服务错误",
      invalid_request: "模型请求无效",
      unavailable: "模型暂不可用",
      context_overflow: "模型上下文超限",
      invalid_response: "模型响应无效",
    }[error.code]
  }
  if (error instanceof NexumRunError) {
    return error.code === "timeout" ? "Coding Loop 运行超时" : "Session 没有可继续的上下文"
  }
  if (error instanceof NexumSkillInvocationError) {
    return error.code === "skill_not_found" ? "Skill 不存在" : error.code === "skill_not_ready" ? "Skill 当前不可用" : "Skill 权限被拒绝"
  }
  return "Coding Loop 执行失败"
}

/** 判断 Session 是否允许进入目标状态。 */
function isAllowedTransition(from: NexumSessionStatus, to: NexumSessionStatus): boolean {
  if (from === "idle") return to === "running" || to === "cancelled"
  if (from === "running") return to === "completed" || to === "failed" || to === "cancelled"
  if (from === "completed" || from === "failed" || from === "cancelled") return to === "running"
  return false
}

/** Nexum Runtime 对外发布的最小事件。 */
export interface RuntimeEvent {
  /** Optional for compatibility with injected test/adaptor publishers; Core always sets it. */
  readonly eventID?: string
  /** Optional for compatibility with injected test/adaptor publishers; Core always sets it. */
  readonly runID?: string
  readonly type: string
  readonly sessionID: string
  readonly sequence: number
  /** Optional for compatibility with injected test/adaptor publishers; Core always sets it. */
  readonly occurredAt?: string
  readonly data?: Record<string, unknown>
}

/** 运行事件端口。 */
export interface EventSink {
  readonly publish: (event: RuntimeEvent) => Promise<void>
  /**
   * 可选能力：返回该 Session 已发布的最后序号。
   *
   * 持久化实现提供后，Coding Loop 重启时会从 `lastSequence + 1` 继续编号；
   * 未提供该能力的旧 sink 仍从 1 开始。
   */
  readonly lastSequence?: (sessionID: string) => number | Promise<number>
}

/** Nexum Core 的全部外部依赖端口。 */
export interface NexumCorePorts {
  readonly model: ModelPort
  readonly tool: ToolPort
  readonly permission: PermissionPort
  readonly sessions: SessionStore
  readonly events: EventSink
}

/** Nexum Core 创建参数。 */
export interface NexumCoreOptions {
  readonly ports: NexumCorePorts
}

/**
 * 已完成端口绑定的 Nexum Core。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export interface NexumCore {
  readonly ports: NexumCorePorts
}

/**
 * 创建不依赖 UI 的 Nexum Core 组合入口。
 *
 * @param options - Core 运行所需的外部端口
 * @returns 已绑定端口的 Nexum Core
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createNexumCore(options: NexumCoreOptions): NexumCore {
  return { ports: options.ports }
}

export { NexumMessageStoreError } from "./message-store.js"
export type { MessageStore, NexumMessageStoreErrorCode } from "./message-store.js"
export { normalizeNexumToolRequest } from "./tools.js"
export type { NexumToolRegistry, NexumToolRegistryOptions, NexumBuiltinToolName } from "./tools.js"
export { createNexumPermissionBroker, NexumPermissionError, redactNexumSensitiveText } from "./permission.js"
export { redactNexumSensitiveValue } from "./permission.js"
export type {
  NexumPermissionBroker,
  NexumPermissionDecision,
  NexumPermissionErrorCode,
  NexumPermissionReply,
  NexumPermissionRequest,
  NexumPermissionBrokerOptions,
} from "./permission.js"
export {
  evaluateNexumPermissionPolicy,
  nexumAnyToolAction,
  NexumPermissionPolicyError,
  isDangerousNexumToolRequest,
  matchNexumPermissionPattern,
} from "./permission-policy.js"
export type {
  NexumPermissionPolicyDecision,
  NexumPermissionPolicyEffect,
  NexumPermissionPolicyErrorCode,
  NexumPermissionPolicyFilter,
  NexumPermissionPolicyRule,
  NexumPermissionPolicyRuleInput,
  NexumPermissionPolicyRuleUpdate,
  NexumPermissionPolicyScope,
  NexumPermissionPolicySource,
  NexumPermissionPolicyStore,
} from "./permission-policy.js"
export { NexumInteractionStoreError } from "./interaction-store.js"
export type {
  NexumInteractionKind,
  NexumInteractionRecord,
  NexumInteractionStatus,
  NexumInteractionStore,
  NexumInteractionStoreErrorCode,
} from "./interaction-store.js"
export { NexumModelConfigError } from "./model-config.js"
export type {
  NexumModelConfig,
  NexumModelConfigErrorCode,
  NexumModelConfigInput,
  NexumModelConfigStore,
} from "./model-config.js"
export { NexumModelError } from "./model.js"
export type { NexumFetch, NexumModelErrorCode, NexumModelErrorDetails } from "./model.js"
export { createNexumModelProbePort, NexumModelProbeError } from "./model-probe.js"
export type { NexumModelProbeInput, NexumModelProbeMode, NexumModelProbeResult, NexumModelProbePort } from "./model-probe.js"
export type {
  NexumQuestionErrorCode,
  NexumQuestionItem,
  NexumQuestionPort,
  NexumQuestionPortOptions,
  NexumQuestionRequest,
  QuestionPort,
  ContextCompactionPort,
  ContextCompactionResult,
  NexumProjectContextPortOptions,
  ProjectContextEntry,
  ProjectContextPort,
  ProjectContextSource,
} from "./context.js"
export { NexumQuestionError } from "./context.js"
export { createNexumSkillInvocationPort, NexumSkillInvocationError } from "./skill-invocation.js"
export type {
  NexumSkillAttachment,
  NexumSkillInvocationErrorCode,
  NexumSkillInvocationInput,
  NexumSkillInvocationOptions,
  NexumSkillInvocationPort,
  NexumSkillMention,
  NexumSkillPrompt,
  NexumSkillSystemMessage,
} from "./skill-invocation.js"
export type { MemoryItem, MemoryPort, MemoryQuery } from "./memory.js"
export type { HostPort, HostReadInput, HostShellInput, HostWriteInput } from "./host.js"
export { McpError, createMcpRegistry } from "./mcp.js"
export type {
  McpConnection,
  McpConnectionErrorCode,
  McpConnector,
  McpCredentialStore,
  McpErrorSummary,
  McpOAuthAttempt,
  McpOAuthAttemptStatus,
  McpOAuthControlPort,
  McpLegacyServerStatus,
  McpOAuthCredential,
  McpPort,
  McpPrompt,
  McpRegistry,
  McpRegistryOptions,
  McpResource,
  McpServer,
  McpServerConfig,
  McpServerConfigStore,
  McpServerStatus,
  McpTool,
  McpToolCall,
} from "./mcp.js"
export { isUnsafeMcpHostname, normalizeMcpServerConfig, validateMcpServerConfig } from "./mcp.js"
export { createNexumRuntime, NexumRuntimeError } from "./runtime.js"
export type {
  NexumCapability,
  NexumCapabilityStatus,
  NexumRuntime,
  NexumRuntimeOptions,
  NexumRuntimeStatus,
} from "./runtime.js"
