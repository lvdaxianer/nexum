/** Nexum Core 的 canonical 消息历史端口。 */

import type { ModelMessage } from "./index.js"

/** 按 Session 保存 canonical ModelMessage 历史的可替换端口。 */
export interface MessageStore {
  readonly load: (sessionID: string) => Promise<readonly ModelMessage[]>
  readonly save: (sessionID: string, messages: readonly ModelMessage[]) => Promise<void>
  readonly delete: (sessionID: string) => Promise<void>
}

/** 消息 Store 领域错误码。 */
export type NexumMessageStoreErrorCode = "invalid_file" | "corrupt_file" | "invalid_messages" | "write_failed"

/** 消息 Store 领域错误。 */
export class NexumMessageStoreError extends Error {
  constructor(
    readonly code: NexumMessageStoreErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumMessageStoreError"
  }
}
