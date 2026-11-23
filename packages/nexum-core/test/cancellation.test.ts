import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createNexumCodingLoop,
  createNexumSessionService,
  type EventSink,
  type MessageStore,
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
  const cancellation = loop.cancel(session.sessionID)
  release.resolve()
  const cancelled = await cancellation
  const completed = await run
  const finalSession = await sessions.get(session.sessionID)

  expect(cancelled.status).toBe("cancelled")
  expect(completed.status).toBe("cancelled")
  expect(finalSession?.status).toBe("cancelled")
  expect(executedTools).toBe(0)
  expect(events).toEqual(["model.attempt", "assistant.text", "session.cancelled", "run.settled"])

  await rm(directory, { recursive: true, force: true })
})

test("waits for an aborted run before deletion so no later writes occur", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-cancel-delete-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const modelStarted = deferred()
  let saveCount = 0
  const messageStore: MessageStore = {
    async load() {
      return []
    },
    async save() {
      saveCount += 1
    },
    async delete() {},
  }
  const model: ModelPort = {
    async *prompt(input) {
      modelStarted.resolve()
      await new Promise<never>((_, reject) => {
        if (input.signal?.aborted) {
          reject(new Error("模型已中止"))
          return
        }
        input.signal?.addEventListener("abort", () => reject(new Error("模型已中止")), { once: true })
      })
      yield { type: "completed" }
    },
  }
  const loop = createNexumCodingLoop({
    model,
    messageStore,
    sessions,
    tool: { async execute() { return { ok: true, output: "unused" } } },
    permission: { async evaluate() { return "allow" } },
    events: { async publish() {} },
  })

  const started = loop.start!({ sessionID: session.sessionID, text: "可取消任务" })
  if (!started.accepted) throw new Error("运行未被接受")
  await modelStarted.promise
  const cancelled = await loop.cancel(session.sessionID)
  const savesAfterCancel = saveCount
  await sessions.delete(session.sessionID, async () => messageStore.delete(session.sessionID))
  await Promise.resolve()

  expect(cancelled.status).toBe("cancelled")
  expect(await started.promise).toMatchObject({ status: "cancelled" })
  expect(await sessions.get(session.sessionID)).toBeUndefined()
  expect(saveCount).toBe(savesAfterCancel)
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
    { type: "model.attempt", data: { attempt: 1, maxRetries: 2 } },
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
  expect(events).toEqual(["model.attempt", "tool.request", "session.failed", "run.settled"])
  await rm(directory, { recursive: true, force: true })
})
