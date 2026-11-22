import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ContextCompactionPort } from "../src/context.ts"
import {
  createFileMessageStore,
  createHeadlessCodingLoop,
  createHeadlessProjectContextPort,
  createHeadlessSessionService,
  createInMemoryMessageStore,
  HeadlessModelError,
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

test("includes the previous user and assistant turns in the next run of the same session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-history-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      yield { type: "text", content: `回复:${input.text}` }
      yield { type: "completed" }
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
  const events: EventSink = { async publish() {} }
  const loop = createHeadlessCodingLoop({ model, tool, permission, sessions, events })

  await loop.run({ sessionID: session.sessionID, text: "第一轮任务" })
  await loop.run({ sessionID: session.sessionID, text: "第二轮任务" })

  expect(prompts).toHaveLength(2)
  expect(prompts[1]?.messages).toEqual([
    { role: "user", content: "第一轮任务" },
    { role: "assistant", content: "回复:第一轮任务" },
    { role: "user", content: "第二轮任务" },
  ])
})

test("deduplicates skill and project context system messages across runs and persists only canonical history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-context-dedup-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createInMemoryMessageStore()
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      yield { type: "text", content: `回复:${input.text}` }
      yield { type: "completed" }
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
  const events: EventSink = { async publish() {} }
  const skills = {
    async resolve() {
      return {
        skills: [],
        systemMessages: [
          {
            role: "system" as const,
            content: '<skill_content id="known-skill">只允许使用 Headless API</skill_content>',
            sourceID: "skill:known-skill",
          },
        ],
      }
    },
  }
  const projectContext = createHeadlessProjectContextPort({
    sources: [{ sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" }],
    readFile: async () => "必须先读取项目规范",
  })
  const loop = createHeadlessCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events,
    messageStore,
    skills,
    projectContext,
  })

  await loop.run({ sessionID: session.sessionID, text: "执行 @known-skill 第一轮" })
  await loop.run({ sessionID: session.sessionID, text: "执行 @known-skill 第二轮" })

  const systemSourceIDs =
    prompts[1]?.messages?.flatMap((message) =>
      message.role === "system" && message.sourceID ? [message.sourceID] : [],
    ) ?? []
  expect(systemSourceIDs).toEqual(["skill:known-skill", "instruction:project"])
  expect(new Set(systemSourceIDs).size).toBe(systemSourceIDs.length)
  expect(await messageStore.load(session.sessionID)).toEqual([
    { role: "user", content: "执行 @known-skill 第一轮" },
    { role: "assistant", content: "回复:执行 @known-skill 第一轮" },
    { role: "user", content: "执行 @known-skill 第二轮" },
    { role: "assistant", content: "回复:执行 @known-skill 第二轮" },
  ])
})

test("loads history written by an earlier loop from the same file message store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-file-store-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createFileMessageStore({ filePath: join(directory, "messages.json") })
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

  const firstModel: ModelPort = {
    async *prompt() {
      yield { type: "text", content: "第一轮回复" }
      yield { type: "completed" }
    },
  }
  await createHeadlessCodingLoop({ model: firstModel, tool, permission, sessions, events, messageStore }).run({
    sessionID: session.sessionID,
    text: "第一轮任务",
  })

  const secondPrompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const secondModel: ModelPort = {
    async *prompt(input) {
      secondPrompts.push(input)
      yield { type: "completed" }
    },
  }
  await createHeadlessCodingLoop({ model: secondModel, tool, permission, sessions, events, messageStore }).run({
    sessionID: session.sessionID,
    text: "第二轮任务",
  })

  expect(secondPrompts[0]?.messages).toEqual([
    { role: "user", content: "第一轮任务" },
    { role: "assistant", content: "第一轮回复" },
    { role: "user", content: "第二轮任务" },
  ])
})

test("persists reasoning content together with assistant tool calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-reasoning-history-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const filePath = join(directory, "messages.json")
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const tool: ToolPort = { async execute() { return { ok: true, output: "README 内容" } } }
  const events: EventSink = { async publish() {} }
  const firstModel: ModelPort = {
    async *prompt(input) {
      if (input.messages?.some((message) => message.role === "tool")) {
        yield { type: "completed" }
        return
      }
      yield {
        type: "tool-call",
        reasoningContent: "先读取 README 再回答",
        toolCallID: "call_reasoning_001",
        toolName: "read",
        toolInput: { path: "README.md" },
      }
    },
  }
  await createHeadlessCodingLoop({
    model: firstModel,
    tool,
    permission,
    sessions,
    events,
    messageStore: createFileMessageStore({ filePath }),
  }).run({ sessionID: session.sessionID, text: "请读取 README.md" })

  const secondPrompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const secondModel: ModelPort = {
    async *prompt(input) {
      secondPrompts.push(input)
      yield { type: "completed" }
    },
  }
  await createHeadlessCodingLoop({
    model: secondModel,
    tool,
    permission,
    sessions,
    events,
    messageStore: createFileMessageStore({ filePath }),
  }).run({ sessionID: session.sessionID, text: "继续回答" })

  expect(secondPrompts[0]?.messages).toEqual([
    { role: "user", content: "请读取 README.md" },
    {
      role: "assistant",
      reasoningContent: "先读取 README 再回答",
      toolCalls: [{ id: "call_reasoning_001", name: "read", input: { path: "README.md" } }],
    },
    { role: "tool", toolCallID: "call_reasoning_001", content: "README 内容" },
    { role: "user", content: "继续回答" },
  ])
})

test("does not fail a long tool chain at an arbitrary sixteen-step boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-long-chain-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  let modelCalls = 0
  const model: ModelPort = {
    async *prompt(input) {
      modelCalls += 1
      const toolResults = input.messages?.filter((message) => message.role === "tool").length ?? 0
      if (toolResults < 17) {
        yield {
          type: "tool-call",
          toolCallID: `call_long_${toolResults + 1}`,
          toolName: "read",
          toolInput: { path: `file-${toolResults + 1}.txt` },
        }
        return
      }
      yield { type: "text", content: "长任务已完成" }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "已读取" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const events: EventSink = { async publish() {} }

  const result = await createHeadlessCodingLoop({ model, tool, permission, sessions, events }).run({
    sessionID: session.sessionID,
    text: "完成长任务",
  })

  expect(result.status).toBe("completed")
  expect(modelCalls).toBe(18)
})

test("uses a configured step limit to request a tool-free graceful summary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-step-limit-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      if (prompts.length === 1) {
        yield { type: "tool-call", toolCallID: "call_limit_001", toolName: "read", toolInput: { path: "a.txt" } }
        return
      }
      yield { type: "text", content: "已到达步骤预算，任务已安全收尾。" }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "内容" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const events: EventSink = { async publish() {} }

  const result = await createHeadlessCodingLoop({ model, tool, permission, sessions, events, maxSteps: 1 }).run({
    sessionID: session.sessionID,
    text: "执行任务",
  })

  expect(result.status).toBe("completed")
  expect(prompts[1]?.tools).toEqual([])
  expect(prompts[1]?.messages?.at(-1)).toMatchObject({ role: "user" })
})

test("retries a temporarily unavailable model before failing the session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-retry-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  let attempts = 0
  const eventTypes: string[] = []
  const model: ModelPort = {
    async *prompt() {
      attempts += 1
      if (attempts === 1) throw new HeadlessModelError("unavailable", "模型服务临时不可用")
      yield { type: "text", content: "重试成功" }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "unused" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const events: EventSink = { async publish(event) { eventTypes.push(event.type) } }

  const result = await createHeadlessCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events,
    maxModelRetries: 1,
    retryDelayMs: 0,
  }).run({ sessionID: session.sessionID, text: "重试任务" })

  expect(result.status).toBe("completed")
  expect(attempts).toBe(2)
  expect(eventTypes).toContain("model.retry")
})

test("compacts and resumes when the model reports context overflow", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-overflow-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  let modelCalls = 0
  let compactCalls = 0
  const eventTypes: string[] = []
  const model: ModelPort = {
    async *prompt() {
      modelCalls += 1
      if (modelCalls === 1) throw new HeadlessModelError("context_overflow", "上下文长度超限")
      yield { type: "text", content: "压缩后继续完成" }
      yield { type: "completed" }
    },
  }
  const compaction: ContextCompactionPort = {
    estimate: () => 1,
    async compact(input) {
      compactCalls += 1
      return { summary: "历史摘要", recentMessages: input.messages.slice(-1), context: [] }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "unused" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const events: EventSink = { async publish(event) { eventTypes.push(event.type) } }

  const result = await createHeadlessCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events,
    contextCompaction: compaction,
  }).run({ sessionID: session.sessionID, text: "超长上下文任务" })

  expect(result.status).toBe("completed")
  expect(modelCalls).toBe(2)
  expect(compactCalls).toBe(1)
  expect(eventTypes).toEqual([
    "context.compaction.started",
    "context.compaction.completed",
    "assistant.text",
    "session.completed",
  ])
})

test("continues a model response truncated by the output limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-loop-output-limit-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      if (prompts.length === 1) {
        yield { type: "text", content: "回答前半" }
        yield { type: "completed", finishReason: "length" }
        return
      }
      yield { type: "text", content: "回答后半" }
      yield { type: "completed", finishReason: "stop" }
    },
  }
  const tool: ToolPort = { async execute() { return { ok: true, output: "unused" } } }
  const permission: PermissionPort = { async evaluate() { return "allow" } }
  const events: EventSink = { async publish() {} }

  const result = await createHeadlessCodingLoop({ model, tool, permission, sessions, events }).run({
    sessionID: session.sessionID,
    text: "完整回答这个问题",
  })

  expect(result.status).toBe("completed")
  expect(prompts).toHaveLength(2)
  expect(prompts[1]?.messages).toContainEqual({ role: "assistant", content: "回答前半" })
  expect(prompts[1]?.messages?.at(-1)).toMatchObject({ role: "user" })
})
