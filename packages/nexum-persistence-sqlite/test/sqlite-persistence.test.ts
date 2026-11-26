import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { createSqlitePersistence, createSqliteSessionStore, NexumSqlitePersistenceError } from "../src/index.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("persists runtime records across database reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-"))
  directories.push(directory)
  const databasePath = join(directory, "runtime.db")
  const first = await createSqlitePersistence({ databasePath })
  const session = {
    sessionID: "ses_sqlite",
    name: "SQLite",
    directory,
    status: "idle" as const,
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }

  await first.sessionStore.save(session)
  await first.messageStore.save(session.sessionID, [{ role: "user", content: "hello" }])
  await first.executionStore.claim({ executionID: "exec_sqlite", sessionID: session.sessionID, mode: "prompt", maxAttempts: 3 })
  await first.modelConfig.update({ baseUrl: "https://model.example.test/v1", model: "demo", credential: "secret" })
  await first.rolePrompt.update("回答中文")
  await first.permissionPolicyStore.add({ action: "read", resource: "src", effect: "allow" })
  await first.memory.upsert({ id: "m1", namespace: "project", content: "persistent" })
  await first.eventHub.publish({ eventID: "evt_1", type: "session.created", sessionID: session.sessionID, sequence: 1 })
  first.close()

  const second = await createSqlitePersistence({ databasePath })
  expect(await second.sessionStore.get(session.sessionID)).toEqual(session)
  expect(await second.messageStore.load(session.sessionID)).toEqual([{ role: "user", content: "hello" }])
  expect(await second.executionStore.get("exec_sqlite")).toMatchObject({ status: "running", attempt: 1, recoverable: true })
  expect(await second.modelConfig.get()).toEqual({ baseUrl: "https://model.example.test/v1", model: "demo", credentialConfigured: true })
  expect(await second.modelConfig.resolveCredential()).toBe("secret")
  expect(await second.rolePrompt.get()).toMatchObject({ prompt: "回答中文", source: "custom" })
  expect(await second.permissionPolicyStore.list()).toHaveLength(1)
  expect(await second.memory.search({ text: "persistent" })).toHaveLength(1)
  expect(second.eventHub.lastSequence(session.sessionID)).toBe(1)
  const iterator = second.eventHub.subscribe(session.sessionID, { afterSequence: 0 })[Symbol.asyncIterator]()
  await expect(iterator.next()).resolves.toMatchObject({ value: { eventID: "evt_1" }, done: false })
  await iterator.return?.()
  second.close()
})

test("keeps credential reads separate from safe model configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-secret-"))
  directories.push(directory)
  const persistence = await createSqlitePersistence({ databasePath: join(directory, "runtime.db") })
  await persistence.mcpCredentialStore.save({ serverID: "server", accessToken: "secret-token" })
  expect(await persistence.mcpCredentialStore.get("server")).toEqual({ serverID: "server", accessToken: "secret-token" })
  expect(await persistence.modelConfig.get()).toBeUndefined()
  persistence.close()
})

test("serializes independent SQLite writes without losing records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-concurrency-"))
  directories.push(directory)
  const persistence = await createSqlitePersistence({ databasePath: join(directory, "runtime.db") })
  await Promise.all(Array.from({ length: 20 }, (_, index) => persistence.sessionStore.save({
    sessionID: `ses_${index}`,
    name: `Session ${index}`,
    directory,
    status: "idle",
    createdAt: `2026-11-25T00:00:${String(index).padStart(2, "0")}.000Z`,
    updatedAt: `2026-11-25T00:00:${String(index).padStart(2, "0")}.000Z`,
  })))
  expect(await persistence.sessionStore.list()).toHaveLength(20)
  persistence.close()
})

test("keeps the SQLite directory and database private", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-permissions-"))
  directories.push(directory)
  const dataDirectory = join(directory, "private")
  const databasePath = join(dataDirectory, "runtime.db")
  const persistence = await createSqlitePersistence({ databasePath })

  expect((await stat(dataDirectory)).mode & 0o777).toBe(0o700)
  expect((await stat(databasePath)).mode & 0o777).toBe(0o600)
  persistence.close()
})

test("rejects a database schema newer than the adapter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-schema-"))
  directories.push(directory)
  const databasePath = join(directory, "runtime.db")
  const database = new Database(databasePath)
  database.run("PRAGMA user_version = 999")
  database.close()

  await expect(createSqlitePersistence({ databasePath })).rejects.toMatchObject({
    code: "schema_unsupported",
    name: "NexumSqlitePersistenceError",
  } satisfies Partial<NexumSqlitePersistenceError>)
})

test("rejects an oversized SQLite namespace instead of returning partial records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-record-limit-"))
  directories.push(directory)
  const databasePath = join(directory, "runtime.db")
  const database = new Database(databasePath)
  database.run("CREATE TABLE nexum_record (namespace TEXT NOT NULL, record_key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (namespace, record_key))")
  const insert = database.query("INSERT INTO nexum_record (namespace, record_key, payload) VALUES ($namespace, $key, $payload)")
  for (let index = 0; index <= 10_000; index += 1) {
    insert.run({ $namespace: "session", $key: `session_${index}`, $payload: JSON.stringify({ sessionID: `session_${index}` }) })
  }

  await expect(createSqliteSessionStore(database).list()).rejects.toMatchObject({
    code: "record_limit",
    name: "NexumSqlitePersistenceError",
  } satisfies Partial<NexumSqlitePersistenceError>)
  database.close()
})

test("deletes a SQLite Session and related records atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-sqlite-delete-"))
  directories.push(directory)
  const persistence = await createSqlitePersistence({ databasePath: join(directory, "runtime.db") })
  const session = {
    sessionID: "ses_delete",
    name: "Delete",
    directory,
    status: "idle" as const,
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }

  await persistence.sessionStore.save(session)
  await persistence.messageStore.save(session.sessionID, [{ role: "user", content: "hello" }])
  await persistence.executionStore.claim({ executionID: "exec_delete", sessionID: session.sessionID, mode: "prompt", maxAttempts: 3 })
  await persistence.interactionStore.save({
    kind: "permission",
    requestID: "permission_delete",
    sessionID: session.sessionID,
    action: "shell",
    resource: "read",
    status: "pending",
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  })
  await persistence.eventHub.publish({ sessionID: session.sessionID, sequence: 1, type: "session.created" })

  await persistence.atomicDelete?.(session.sessionID)

  expect(await persistence.sessionStore.get(session.sessionID)).toBeUndefined()
  expect(await persistence.messageStore.load(session.sessionID)).toEqual([])
  expect(await persistence.executionStore.get("exec_delete")).toBeUndefined()
  expect(await persistence.interactionStore.get("permission_delete")).toBeUndefined()
  expect(persistence.eventHub.lastSequence(session.sessionID)).toBe(0)
  persistence.close()
})
