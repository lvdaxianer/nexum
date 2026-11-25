import type { Database } from "bun:sqlite"

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
  return database.query("SELECT payload FROM nexum_record WHERE namespace = $namespace ORDER BY record_key").all({
    $namespace: namespace,
  }).map((row) => JSON.parse((row as { payload: string }).payload) as T)
}
