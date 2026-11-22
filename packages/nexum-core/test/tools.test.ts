import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNexumSessionService, normalizeNexumToolRequest } from "../src/index.ts"
import { createNexumToolRegistry } from "../../nexum-adapters/src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("registers read, write/edit, and shell tools with normalized permission resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  expect(registry.names).toEqual(["read", "write", "edit", "shell"])
  expect(normalizeNexumToolRequest(session.sessionID, "read", { path: "README.md" })).toMatchObject({
    action: "read",
    resource: "README.md",
  })
  expect(
    normalizeNexumToolRequest(session.sessionID, "edit", { path: "README.md", content: "updated" }),
  ).toMatchObject({
    action: "write",
    resource: "README.md",
  })
  expect(normalizeNexumToolRequest(session.sessionID, "shell", { command: "echo ok" })).toMatchObject({
    action: "shell",
    resource: "echo ok",
  })
})

test("executes registered file tools inside the session directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  const write = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "write", { path: "notes.txt", content: "hello" }),
  )
  const read = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "read", { path: "notes.txt" }),
  )
  const shell = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "shell", { command: "printf ok" }),
  )

  expect(write).toEqual({ ok: true, output: "" })
  expect(read).toEqual({ ok: true, output: "hello" })
  expect(shell).toEqual({ ok: true, output: "ok" })
})

test("rejects file resources that escape the session directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tools-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions })

  const result = await registry.port.execute(
    normalizeNexumToolRequest(session.sessionID, "read", { path: "../outside.txt" }),
  )

  expect(result.ok).toBe(false)
  expect(result.output).toBe("工具资源必须位于 Session 工作目录内")
})
