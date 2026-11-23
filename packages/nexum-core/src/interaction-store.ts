/** Nexum Core 的权限与 Question 交互持久化端口。 */

import type { NexumQuestionItem } from "./context.js"

/** 交互请求所属能力。 */
export type NexumInteractionKind = "permission" | "question"

/** 交互请求的生命周期状态。 */
export type NexumInteractionStatus = "pending" | "orphaned"

interface InteractionIdentity {
  readonly requestID: string
  readonly sessionID: string
  readonly status: NexumInteractionStatus
  readonly createdAt: string
  readonly updatedAt: string
}

/** 一条已持久化的交互请求摘要。 */
export type NexumInteractionRecord =
  | (InteractionIdentity & {
      readonly kind: "permission"
      readonly action: string
      readonly resource: string
      readonly reason?: string
    })
  | (InteractionIdentity & {
      readonly kind: "question"
      readonly toolCallID: string
      readonly questions: readonly NexumQuestionItem[]
    })

/** 交互请求持久化端口。 */
export interface NexumInteractionStore {
  readonly list: () => Promise<readonly NexumInteractionRecord[]>
  readonly get: (requestID: string) => Promise<NexumInteractionRecord | undefined>
  readonly save: (record: NexumInteractionRecord) => Promise<void>
  readonly delete: (requestID: string) => Promise<void>
  readonly deleteSession: (sessionID: string) => Promise<void>
}

/** 交互 Store 领域错误码。 */
export type NexumInteractionStoreErrorCode = "invalid_file"

/** 交互 Store 领域错误。 */
export class NexumInteractionStoreError extends Error {
  constructor(
    readonly code: NexumInteractionStoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumInteractionStoreError"
  }
}
