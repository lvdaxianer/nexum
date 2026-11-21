import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createHeadlessCodingLoop,
  createHeadlessSessionService,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolRequest,
  type ToolPort,
} from "../src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("runs model text, tool request, tool result, continuation, and completion in order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const events: Array<{ type: string; sessionID: string; sequence: number; data?: Record<string, unknown> }> = []
  const prompts: string[] = []
  const permissionRequests: ToolRequest[] = []

  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input.toolResults?.length ? "continuation" : input.text)
      if (input.toolResults?.length) {
        yield { type: "text", content: "文件内容已读取" }
        yield { type: "completed" }
        return
      }
      yield { type: "text", content: "我先读取文件" }
      yield { type: "tool-call", toolName: "read", toolInput: { path: "README.md" } }
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "README 内容" }
    },
  }
  const permission: PermissionPort = {
    async evaluate(request) {
      permissionRequests.push(request)
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event)
    },
  }

  const loop = createHeadlessCodingLoop({ model, tool, permission, sessions, events: eventSink })
  const completed = await loop.run({ sessionID: session.sessionID, text: "请读取 README.md" })

  expect(completed.status).toBe("completed")
  expect(prompts).toEqual(["请读取 README.md", "continuation"])
  expect(events.map((event) => event.type)).toEqual([
    "assistant.text",
    "tool.request",
    "tool.result",
    "assistant.text",
    "session.completed",
  ])
  expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5])
  expect(events[1]?.data).toMatchObject({ toolName: "read", input: { path: "README.md" } })
  expect(events[2]?.data).toMatchObject({ ok: true, output: "README 内容" })
  expect(permissionRequests[0]).toMatchObject({ action: "read", resource: "README.md" })
})

test("continues the model conversation with the assistant tool call and tool result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-conversation-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  let callCount = 0

  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      callCount += 1
      if (callCount === 1) {
        yield {
          type: "tool-call",
          toolCallID: "call_read_001",
          toolName: "read",
          toolInput: { path: "README.md" },
        }
        return
      }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "README 内容" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const events: EventSink = { async publish() {} }

  await createHeadlessCodingLoop({ model, tool, permission, sessions, events }).run({
    sessionID: session.sessionID,
    text: "请读取 README.md",
  })

  expect(prompts[1]?.messages).toEqual([
    { role: "user", content: "请读取 README.md" },
    {
      role: "assistant",
      toolCalls: [{ id: "call_read_001", name: "read", input: { path: "README.md" } }],
    },
    { role: "tool", toolCallID: "call_read_001", content: "README 内容" },
  ])
})

test("rejects a second run while the first run is active", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-concurrent-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  let releaseFirstRun = () => {}
  let markFirstRunStarted = () => {}
  const firstRunStarted = new Promise<void>((resolve) => {
    markFirstRunStarted = resolve
  })
  const firstRunGate = new Promise<void>((resolve) => {
    releaseFirstRun = resolve
  })
  let calls = 0
  const model: ModelPort = {
    async *prompt() {
      calls += 1
      if (calls === 1) {
        markFirstRunStarted()
        await firstRunGate
      }
      yield { type: "completed" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "unused" }
    },
  }
  const events: EventSink = { async publish() {} }
  const loop = createHeadlessCodingLoop({ model, tool, permission, sessions, events })

  const firstRun = loop.run({ sessionID: session.sessionID, text: "第一轮" })
  await firstRunStarted
  const secondRun = loop.run({ sessionID: session.sessionID, text: "第二轮" })

  await expect(secondRun).rejects.toMatchObject({ code: "session_busy" })
  releaseFirstRun()
  await firstRun
})

test("runs a completed session again with a fresh prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-restart-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: string[] = []
  const events: Array<{ type: string }> = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input.text)
      yield { type: "text", content: input.text }
      yield { type: "completed" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "unused" }
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push({ type: event.type })
    },
  }
  const loop = createHeadlessCodingLoop({ model, tool, permission, sessions, events: eventSink })

  await loop.run({ sessionID: session.sessionID, text: "第一轮任务" })
  await loop.run({ sessionID: session.sessionID, text: "第二轮任务" })

  expect(prompts).toEqual(["第一轮任务", "第二轮任务"])
  expect(events.filter((event) => event.type === "session.completed")).toHaveLength(2)
  expect((await sessions.get(session.sessionID))?.status).toBe("completed")
})

test("executes every tool call in one assistant response before continuing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-multi-tool-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const executedTools: string[] = []

  const model: ModelPort = {
    async *prompt(input) {
      if (!input.messages?.some((message) => message.role === "tool")) {
        yield {
          type: "tool-call",
          toolCalls: [
            { id: "call_read_001", name: "read", input: { path: "README.md" } },
            { id: "call_read_002", name: "read", input: { path: "package.json" } },
          ],
        } as never
        return
      }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = {
    async execute(request) {
      executedTools.push(request.toolName)
      return { ok: true, output: request.resource }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const events: EventSink = { async publish() {} }

  await createHeadlessCodingLoop({ model, tool, permission, sessions, events }).run({
    sessionID: session.sessionID,
    text: "请读取两个文件",
  })

  expect(executedTools).toEqual(["read", "read"])
})
