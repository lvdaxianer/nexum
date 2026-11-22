import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { createNexumSessionService } from "../src/index.ts"
import { createInMemorySessionStore, createLocalDirectoryValidator } from "@nexum/adapters"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nexum-session-"))
  temporaryDirectories.push(directory)
  return directory
}

test("creates an idle session for a valid working directory", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()

  const session = await service.create({ directory })

  expect(session).toMatchObject({ directory, status: "idle" })
  expect(session.sessionID).toMatch(/^[0-9a-f-]{36}$/)
  expect(await service.get(session.sessionID)).toEqual(session)
})

test("creates a named session with durable timestamps", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()

  const session = await service.create({ directory })

  expect(session.name).toBe(basename(directory))
  expect(session.createdAt).toBeString()
  expect(session.updatedAt).toBe(session.createdAt)
})

test("updates a session name without changing its directory or id", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()
  const session = await service.create({ directory, name: "旧名称" })

  const updated = await service.update(session.sessionID, { name: "新名称" })

  expect(updated).toMatchObject({ sessionID: session.sessionID, directory, name: "新名称" })
  expect(updated.updatedAt).not.toBe(session.updatedAt)
})

test("rejects an empty name when updating a session", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()
  const session = await service.create({ directory, name: "项目" })

  await expect(service.update(session.sessionID, { name: "   " })).rejects.toMatchObject({ code: "invalid_name" })
})

test("lists sessions for page-level session recovery", async () => {
  const firstDirectory = await makeDirectory()
  const secondDirectory = await makeDirectory()
  const service = createNexumSessionService()

  const first = await service.create({ directory: firstDirectory })
  const second = await service.create({ directory: secondDirectory })

  expect(new Set((await service.list()).map((session) => session.sessionID))).toEqual(
    new Set([first.sessionID, second.sessionID]),
  )
})

test("rejects an invalid directory without creating a session", async () => {
  const store = createInMemorySessionStore()
  const service = createNexumSessionService({ store, directoryValidator: createLocalDirectoryValidator() })

  await expect(
    service.create({ directory: join(tmpdir(), `missing-nexum-directory-${crypto.randomUUID()}`) }),
  ).rejects.toMatchObject({ code: "invalid_directory" })
  await expect(service.create({ directory: "   " })).rejects.toMatchObject({ code: "invalid_directory" })
  expect(await store.list()).toEqual([])
})

test("keeps session state transitions explicit and restartable", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()
  const session = await service.create({ directory })

  const running = await service.setStatus(session.sessionID, "running")
  const completed = await service.setStatus(session.sessionID, "completed")

  expect(running.status).toBe("running")
  expect(completed.status).toBe("completed")
  expect((await service.setStatus(session.sessionID, "running")).status).toBe("running")
})

test("allows a completed session to start a later run", async () => {
  const directory = await makeDirectory()
  const service = createNexumSessionService()
  const session = await service.create({ directory })

  await service.setStatus(session.sessionID, "running")
  await service.setStatus(session.sessionID, "completed")

  const restarted = await service.setStatus(session.sessionID, "running")

  expect(restarted.status).toBe("running")
})
