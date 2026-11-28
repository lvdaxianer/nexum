export {
  CHAT_PROTOCOL_METHODS,
  ChatProtocolError,
  createChatProtocolAdapter,
  normalizeChatProtocolError,
} from "@nexum/surface-adapter"
export type {
  ChatEventSubscription,
  ChatHistoryPage,
  ChatHistoryRequest,
  ChatMessageInput,
  ChatPermissionReplyInput,
  ChatProtocolAdapter,
  ChatProtocolMethod,
  ChatQuestionCancelInput,
  ChatQuestionReplyInput,
  ChatSessionID,
  ChatStateSnapshot,
  NexumEvent,
  NexumPermission,
  NexumQuestion,
  NexumSession,
  NexumSessionMessages,
  NexumSkill,
} from "@nexum/surface-adapter"

export { ChatSurface } from "./chat-surface"
export type { ChatItem, ChatSurfaceProps, ChatSurfaceTheme } from "./chat-surface"
export const CHAT_SURFACE_TAG = "nexum-chat" as const
export { defineChatSurfaceElement } from "./web-component"
