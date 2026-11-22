import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createNexumCodingLoop,
  createNexumSessionService,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("cancels a waiting run before its next tool executes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-cancel-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const started = deferred()
  const release = deferred()
  const events: string[] = []
  let executedTools = 0

  const model: ModelPort = {
    async *prompt() {
      yield { type: "text", content: "准备读取文件" }
      started.resolve()
      await release.promise
      yield { type: "tool-call", toolName: "read", toolInput: { path: "README.md" } }
    },
  }
  const tool: ToolPort = {
    async execute() {
      executedTools += 1
      return { ok: true, output: "不应执行" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event.type)
    },
  }
  const loop = createNexumCodingLoop({ model, tool, permission, sessions, events: eventSink })
  const run = loop.run({ sessionID: session.sessionID, text: "请读取 README.md" })

  await started.promise
  const cancelled = await loop.cancel(session.sessionID)
  release.resolve()
  const completed = await run
  const finalSession = await sessions.get(session.sessionID)

  expect(cancelled.status).toBe("cancelled")
  expect(completed.status).toBe("cancelled")
  expect(finalSession?.status).toBe("cancelled")
  expect(executedTools).toBe(0)
  expect(events).toEqual(["assistant.text", "session.cancelled", "run.settled"])

  await rm(directory, { recursive: true, force: true })
})

test("marks model failures as terminal failed sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-failure-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const events: Array<{ type: string; data?: Record<string, unknown> }> = []
  const model: ModelPort = {
    async *prompt() {
      throw new Error("模型不可达")
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "unused" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push({ type: event.type, data: event.data })
    },
  }
  const loop = createNexumCodingLoop({ model, tool, permission, sessions, events: eventSink })

  await expect(loop.run({ sessionID: session.sessionID, text: "测试失败" })).rejects.toThrow("模型不可达")

  expect((await sessions.get(session.sessionID))?.status).toBe("failed")
  expect(events).toEqual([
    { type: "session.failed", data: { message: "模型不可达" } },
    { type: "run.settled", data: { result: "failed" } },
  ])
  await rm(directory, { recursive: true, force: true })
})

test("marks tool failures as terminal failed sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-tool-failure-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const events: string[] = []
  const model: ModelPort = {
    async *prompt() {
      yield { type: "tool-call", toolName: "shell", toolInput: { command: "false" } }
    },
  }
  const tool: ToolPort = {
    async execute() {
      throw new Error("工具执行失败")
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event.type)
    },
  }
  const loop = createNexumCodingLoop({ model, tool, permission, sessions, events: eventSink })

  await expect(loop.run({ sessionID: session.sessionID, text: "执行命令" })).rejects.toThrow("工具执行失败")

  expect((await sessions.get(session.sessionID))?.status).toBe("failed")
  expect(events).toEqual(["tool.request", "session.failed", "run.settled"])
  await rm(directory, { recursive: true, force: true })
})
