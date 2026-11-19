import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { HeadlessSessionError, createHeadlessSessionService, createInMemorySessionStore } from "../src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "headless-session-"))
  temporaryDirectories.push(directory)
  return directory
}

test("creates an idle session for a valid working directory", async () => {
  const directory = await makeDirectory()
  const service = createHeadlessSessionService()

  const session = await service.create({ directory })

  expect(session).toMatchObject({ directory, status: "idle" })
  expect(session.sessionID).toMatch(/^[0-9a-f-]{36}$/)
  expect(await service.get(session.sessionID)).toEqual(session)
})

test("rejects an invalid directory without creating a session", async () => {
  const store = createInMemorySessionStore()
  const service = createHeadlessSessionService({ store })

  await expect(
    service.create({ directory: join(tmpdir(), `missing-headless-directory-${crypto.randomUUID()}`) }),
  ).rejects.toMatchObject({ code: "invalid_directory" })
  await expect(service.create({ directory: "   " })).rejects.toMatchObject({ code: "invalid_directory" })
  expect(await store.list()).toEqual([])
})

test("keeps session state transitions explicit and terminal", async () => {
  const directory = await makeDirectory()
  const service = createHeadlessSessionService()
  const session = await service.create({ directory })

  const running = await service.setStatus(session.sessionID, "running")
  const completed = await service.setStatus(session.sessionID, "completed")

  expect(running.status).toBe("running")
  expect(completed.status).toBe("completed")
  await expect(service.setStatus(session.sessionID, "running")).rejects.toBeInstanceOf(HeadlessSessionError)
})
