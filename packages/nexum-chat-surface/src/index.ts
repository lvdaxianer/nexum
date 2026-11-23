import { Nexum, NexumClientError, type NexumClientOptions, type NexumResponse } from "@nexum/client"
import type {
  NexumEvent,
  NexumEventOptions,
  NexumPermission,
  NexumQuestion,
  NexumSessionMessages,
  NexumSessionState,
  NexumSkill,
} from "@nexum/client"

/** ChatSurface 支持的协议操作集合。 */
export const CHAT_PROTOCOL_METHODS = [
  "loadHistory",
  "loadState",
  "subscribeEvents",
  "listSkills",
  "sendMessage",
  "replyPermission",
  "replyQuestion",
  "cancelQuestion",
  "cancelRun",
  "continueRun",
] as const

/** ChatSurface 协议适配器操作名。 */
export type ChatProtocolMethod = (typeof CHAT_PROTOCOL_METHODS)[number]

/** ChatSurface 使用的会话标识。 */
export type ChatSessionID = string

/** 加载会话历史消息的请求参数。 */
export type ChatHistoryRequest = {
  readonly sessionID: ChatSessionID
  readonly before?: number
  readonly limit?: number
  readonly snapshotID?: string
}

/** ChatSurface 的历史消息页。 */
export type ChatHistoryPage = NexumSessionMessages

/** ChatSurface 的会话状态快照。 */
export type ChatStateSnapshot = NexumSessionState

/** ChatSurface 事件订阅参数。 */
export type ChatEventSubscription = {
  readonly sessionID: ChatSessionID
  readonly afterSequence?: number
  readonly signal?: AbortSignal
  readonly headers?: NexumEventOptions["headers"]
}

/** 发送用户消息的请求参数。 */
export type ChatMessageInput = {
  readonly sessionID: ChatSessionID
  readonly text: string
}

/** 回复权限请求的参数。 */
export type ChatPermissionReplyInput = {
  readonly sessionID: ChatSessionID
  readonly requestID: string
  readonly decision: "allow_once" | "allow_always" | "deny"
}

/** 回复问题请求的参数。 */
export type ChatQuestionReplyInput = {
  readonly sessionID: ChatSessionID
  readonly requestID: string
  readonly answers: readonly (readonly string[])[]
}

/** 取消问题请求的参数。 */
export type ChatQuestionCancelInput = {
  readonly sessionID: ChatSessionID
  readonly requestID: string
}

/** ChatSurface 与协议层之间的完整聊天能力边界。 */
export interface ChatProtocolAdapter {
  /** 加载指定会话的一页历史消息。 */
  loadHistory(input: ChatHistoryRequest): Promise<ChatHistoryPage>
  /** 加载指定会话的当前状态。 */
  loadState(sessionID: ChatSessionID): Promise<ChatStateSnapshot>
  /** 从指定序号之后订阅会话事件。 */
  subscribeEvents(input: ChatEventSubscription): AsyncIterable<NexumEvent>
  /** 查询可用于 @skill 自动补全的技能列表。 */
  listSkills(): Promise<readonly NexumSkill[]>
  /** 向会话发送用户消息。 */
  sendMessage(input: ChatMessageInput): Promise<void>
  /** 回复一个权限请求。 */
  replyPermission(input: ChatPermissionReplyInput): Promise<void>
  /** 回复一个问题请求。 */
  replyQuestion(input: ChatQuestionReplyInput): Promise<void>
  /** 取消一个待回答的问题请求。 */
  cancelQuestion(input: ChatQuestionCancelInput): Promise<void>
  /** 取消当前会话运行。 */
  cancelRun(sessionID: ChatSessionID): Promise<void>
  /** 继续一个可继续的会话运行。 */
  continueRun(sessionID: ChatSessionID): Promise<void>
}

/** ChatSurface 对外暴露的稳定协议错误。 */
export class ChatProtocolError extends Error {
  readonly status: number | undefined
  readonly code: string
  readonly traceId: string | undefined

  constructor(options: { readonly code: string; readonly message: string; readonly status?: number; readonly traceId?: string }) {
    super(options.message)
    this.name = "ChatProtocolError"
    this.status = options.status
    this.code = options.code
    this.traceId = options.traceId
  }
}

/** 将 Client 或未知异常归一化为 ChatSurface 可识别的协议错误。 */
export function normalizeChatProtocolError(error: unknown): ChatProtocolError {
  if (error instanceof ChatProtocolError) return error
  if (error instanceof NexumClientError) {
    return new ChatProtocolError({
      status: error.status,
      code: error.code,
      message: error.message,
      traceId: error.traceId,
    })
  }
  if (error instanceof Error) return new ChatProtocolError({ code: "CHAT_PROTOCOL_UNKNOWN_ERROR", message: error.message })
  return new ChatProtocolError({ code: "CHAT_PROTOCOL_UNKNOWN_ERROR", message: "聊天协议请求失败" })
}

/** 创建基于 @nexum/client 的默认 ChatSurface 协议适配器。 */
export function createChatProtocolAdapter(options: NexumClientOptions = {}): ChatProtocolAdapter {
  const client = Nexum.make(options)
  return {
    loadHistory: (input) => readData(client.experimental.nexum.session.messages(input)),
    loadState: (sessionID) => readData(client.experimental.nexum.session.state({ sessionID })),
    subscribeEvents: (input) => subscribeEvents(client, input),
    listSkills: () => readData(client.experimental.nexum.skill.list()),
    sendMessage: async (input) => {
      await readData(client.experimental.nexum.session.prompt(input))
    },
    replyPermission: async (input) => {
      await readData(client.experimental.nexum.session.permission.reply(input))
    },
    replyQuestion: async (input) => {
      await readData(client.experimental.nexum.session.question.reply(input))
    },
    cancelQuestion: async (input) => {
      await readData(client.experimental.nexum.session.question.cancel(input))
    },
    cancelRun: async (sessionID) => {
      await readData(client.experimental.nexum.session.cancel({ sessionID }))
    },
    continueRun: async (sessionID) => {
      await readData(client.experimental.nexum.session.continue({ sessionID }))
    },
  }
}

type NexumClient = ReturnType<typeof Nexum.make>

async function readData<T>(request: Promise<NexumResponse<T>>): Promise<T> {
  try {
    return (await request).data
  } catch (error) {
    throw normalizeChatProtocolError(error)
  }
}

async function* subscribeEvents(client: NexumClient, input: ChatEventSubscription): AsyncIterable<NexumEvent> {
  try {
    for await (const event of client.experimental.nexum.session.events(
      { sessionID: input.sessionID },
      { afterSequence: input.afterSequence, signal: input.signal, headers: input.headers },
    )) {
      yield event
    }
  } catch (error) {
    throw normalizeChatProtocolError(error)
  }
}

export type {
  NexumEvent,
  NexumPermission,
  NexumQuestion,
  NexumSkill,
}
