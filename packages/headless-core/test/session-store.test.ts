import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFileSessionStore } from "../src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("restores sessions after a new file store is created", async () => {
  const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
  temporaryDirectories.push(root)
  const filePath = join(root, "sessions.json")
  const first = createFileSessionStore({ filePath })
  const record = {
    sessionID: "session_001",
    name: "project",
    directory: "/workspace/project",
    status: "idle" as const,
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  }

  await first.save(record)

  const second = createFileSessionStore({ filePath })
  await expect(second.get(record.sessionID)).resolves.toEqual(record)
})

test("migrates legacy records without names or timestamps", async () => {
  const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
  temporaryDirectories.push(root)
  const filePath = join(root, "sessions.json")
  await Bun.write(
    filePath,
    JSON.stringify({
      version: 0,
      sessions: [{ sessionID: "legacy", directory: "/tmp/demo", status: "running" }],
    }),
  )

  const session = await createFileSessionStore({ filePath }).get("legacy")

  expect(session).toMatchObject({
    sessionID: "legacy",
    name: "demo",
    directory: "/tmp/demo",
    status: "idle",
  })
  expect(session?.createdAt).toBeString()
  expect(session?.updatedAt).toBeString()
})

test("rejects corrupt session files without replacing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "headless-session-store-"))
  temporaryDirectories.push(root)
  const filePath = join(root, "sessions.json")
  await Bun.write(filePath, "not-json")

  await expect(createFileSessionStore({ filePath }).list()).rejects.toThrow()
  expect(await Bun.file(filePath).text()).toBe("not-json")
})
