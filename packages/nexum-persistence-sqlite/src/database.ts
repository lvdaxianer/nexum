import { chmod, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import { NexumSqlitePersistenceError } from "./errors.ts"

export interface NexumSqliteDatabase {
  readonly database: Database
  readonly databasePath: string
  readonly transaction: <T>(operation: () => T) => T
  readonly close: () => void
}

const SQLITE_SCHEMA_VERSION = 1

export async function openNexumSqliteDatabase(databasePath: string): Promise<NexumSqliteDatabase> {
  if (databasePath !== ":memory:") {
    const directory = dirname(databasePath)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
  }
  const database = new Database(databasePath)
  const schemaVersion = (database.query("PRAGMA user_version").get() as { user_version?: number } | null)?.user_version ?? 0
  if (schemaVersion > SQLITE_SCHEMA_VERSION) {
    database.close()
    throw new NexumSqlitePersistenceError(
      "schema_unsupported",
      `SQLite schema version ${schemaVersion} is newer than supported version ${SQLITE_SCHEMA_VERSION}`,
    )
  }
  database.run("PRAGMA foreign_keys = ON")
  database.run("PRAGMA journal_mode = WAL")
  if (schemaVersion === 0) migrateToVersionOne(database)
  await secureSqliteFiles(databasePath)
  return {
    database,
    databasePath,
    transaction: <T>(operation: () => T) => database.transaction(operation)(),
    close: () => database.close(),
  }
}

function migrateToVersionOne(database: Database): void {
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
  database.run("PRAGMA user_version = 1")
}

async function secureSqliteFiles(databasePath: string): Promise<void> {
  if (databasePath === ":memory:") return
  await chmod(databasePath, 0o600)
  for (const sidecar of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(sidecar)) await chmod(sidecar, 0o600)
  }
}
