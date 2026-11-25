import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"

export interface NexumSqliteDatabase {
  readonly database: Database
  readonly databasePath: string
  readonly transaction: <T>(operation: () => T) => T
  readonly close: () => void
}

export async function openNexumSqliteDatabase(databasePath: string): Promise<NexumSqliteDatabase> {
  if (databasePath !== ":memory:") await mkdir(dirname(databasePath), { recursive: true })
  const database = new Database(databasePath)
  database.run("PRAGMA foreign_keys = ON")
  database.run("PRAGMA journal_mode = WAL")
  database.run(`
    CREATE TABLE IF NOT EXISTS nexum_record (
      namespace TEXT NOT NULL,
      record_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (namespace, record_key)
    )
  `)
  database.run(`
    CREATE TABLE IF NOT EXISTS nexum_event (
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT,
      payload TEXT NOT NULL,
      PRIMARY KEY (session_id, sequence)
    )
  `)
  database.run("CREATE INDEX IF NOT EXISTS nexum_event_event_id ON nexum_event (event_id)")
  return {
    database,
    databasePath,
    transaction: <T>(operation: () => T) => database.transaction(operation)(),
    close: () => database.close(),
  }
}
