import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createSqlitePersistence } from "../src/index.ts"

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
  await first.modelConfig.update({ baseUrl: "https://model.example.test/v1", model: "demo", credential: "secret" })
  await first.rolePrompt.update("回答中文")
  await first.permissionPolicyStore.add({ action: "read", resource: "src", effect: "allow" })
  await first.memory.upsert({ id: "m1", namespace: "project", content: "persistent" })
  await first.eventHub.publish({ eventID: "evt_1", type: "session.created", sessionID: session.sessionID, sequence: 1 })
  first.close()

  const second = await createSqlitePersistence({ databasePath })
  expect(await second.sessionStore.get(session.sessionID)).toEqual(session)
  expect(await second.messageStore.load(session.sessionID)).toEqual([{ role: "user", content: "hello" }])
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
