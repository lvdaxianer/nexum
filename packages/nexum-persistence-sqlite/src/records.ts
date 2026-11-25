import type { Database } from "bun:sqlite"
import { NexumSqlitePersistenceError } from "./errors.ts"

const MAX_RECORD_ROWS = 10_000

export function readRecord<T>(database: Database, namespace: string, key: string): T | undefined {
  const row = database.query("SELECT payload FROM nexum_record WHERE namespace = $namespace AND record_key = $key").get({
    $namespace: namespace,
    $key: key,
  }) as { payload?: string } | null
  return row?.payload === undefined ? undefined : JSON.parse(row.payload) as T
}

export function writeRecord(database: Database, namespace: string, key: string, value: unknown): void {
  database.query(`
    INSERT INTO nexum_record (namespace, record_key, payload)
    VALUES ($namespace, $key, $payload)
    ON CONFLICT(namespace, record_key) DO UPDATE SET payload = excluded.payload
  `).run({ $namespace: namespace, $key: key, $payload: JSON.stringify(value) })
}

export function deleteRecord(database: Database, namespace: string, key: string): void {
  database.query("DELETE FROM nexum_record WHERE namespace = $namespace AND record_key = $key").run({
    $namespace: namespace,
    $key: key,
  })
}

export function readRecords<T>(database: Database, namespace: string): T[] {
  const rows = database.query("SELECT payload FROM nexum_record WHERE namespace = $namespace ORDER BY record_key LIMIT $limit").all({
    $namespace: namespace,
    $limit: MAX_RECORD_ROWS + 1,
  }) as Array<{ payload: string }>
  if (rows.length > MAX_RECORD_ROWS) {
    throw new NexumSqlitePersistenceError("record_limit", `SQLite record limit exceeded for namespace ${namespace}`)
  }
  return rows.map((row) => JSON.parse(row.payload) as T)
}
