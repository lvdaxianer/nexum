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
  type ToolPort,
} from "../src/index.ts"
import type { ContextCompactionPort } from "../src/context.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("compacts accumulated tool history before the next model step", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-compaction-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const events: Array<{ type: string; data?: Record<string, unknown> }> = []
  let compactCalls = 0

  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      if (prompts.length === 1) {
        yield { type: "tool-call", toolCallID: "call_read_001", toolName: "read", toolInput: { path: "README.md" } }
        return
      }
      yield { type: "completed" }
    },
  }
  const compaction: ContextCompactionPort = {
    estimate(messages) {
      return messages.length >= 3 ? 100 : 1
    },
    async compact(input) {
      compactCalls += 1
      expect(input.messages).toHaveLength(3)
      return {
        summary: "用户要求读取 README，工具已经返回内容。",
        recentMessages: input.messages.slice(-1),
        context: [],
      }
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
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event)
    },
  }

  const result = await createHeadlessCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events: eventSink,
    contextCompaction: compaction,
    compactionThreshold: 10,
    compactionKeepRecent: 1,
  }).run({ sessionID: session.sessionID, text: "请读取 README.md" })

  expect(result.status).toBe("completed")
  expect(compactCalls).toBe(1)
  expect(prompts[1]?.messages).toEqual([
    {
      role: "system",
      content: "Context summary:\n用户要求读取 README，工具已经返回内容。",
      sourceID: "context:summary",
    },
    { role: "tool", toolCallID: "call_read_001", content: "README 内容" },
  ])
  expect(events.map((event) => event.type)).toEqual([
    "tool.request",
    "tool.result",
    "context.compaction.started",
    "context.compaction.completed",
    "session.completed",
  ])
})

test("fails safely when context compaction cannot produce a summary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-compaction-failure-"))
  temporaryDirectories.push(directory)
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  let modelCalls = 0
  let toolCalls = 0
  const events: string[] = []

  const model: ModelPort = {
    async *prompt() {
      modelCalls += 1
      yield { type: "completed" }
    },
  }
  const compaction: ContextCompactionPort = {
    estimate: () => 100,
    async compact() {
      throw new Error("摘要服务不可用")
    },
  }
  const tool: ToolPort = {
    async execute() {
      toolCalls += 1
      return { ok: true, output: "" }
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

  await expect(
    createHeadlessCodingLoop({
      model,
      tool,
      permission,
      sessions,
      events: eventSink,
      contextCompaction: compaction,
      compactionThreshold: 10,
    }).run({ sessionID: session.sessionID, text: "继续任务" }),
  ).rejects.toThrow("摘要服务不可用")

  expect(modelCalls).toBe(0)
  expect(toolCalls).toBe(0)
  expect(events).toEqual(["context.compaction.started", "context.compaction.failed", "session.failed"])
})
