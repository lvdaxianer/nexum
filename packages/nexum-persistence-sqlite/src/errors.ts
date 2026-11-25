/** SQLite 持久化边界错误。 */
export type NexumSqlitePersistenceErrorCode = "schema_unsupported" | "record_limit"

export class NexumSqlitePersistenceError extends Error {
  constructor(
    readonly code: NexumSqlitePersistenceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumSqlitePersistenceError"
  }
}
