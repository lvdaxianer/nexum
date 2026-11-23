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

export type {
  NexumEvent,
  NexumPermission,
  NexumQuestion,
  NexumSkill,
}
