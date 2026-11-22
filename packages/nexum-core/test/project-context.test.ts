import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createNexumCodingLoop,
  createNexumSessionService,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"
import { createNexumProjectContextPort } from "../../nexum-adapters/src/index.ts"
import type { ContextCompactionPort } from "../src/context.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("deduplicates project context sources and skips unreadable files", async () => {
  const calls: string[] = []
  const context = createNexumProjectContextPort({
    sources: [
      { sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" },
      { sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" },
      { sourceID: "reference:missing", kind: "reference", path: "missing.md" },
    ],
    readFile: async (path) => {
      calls.push(path)
      return path === "AGENTS.md" ? "只允许使用 Nexum API" : undefined
    },
  })

  await expect(context.load("session_001")).resolves.toEqual([
    {
      sourceID: "instruction:project",
      kind: "instruction",
      path: "AGENTS.md",
      content: "只允许使用 Nexum API",
    },
  ])
  expect(calls).toEqual(["AGENTS.md", "missing.md"])
})

test("restores project context after compaction before the next model step", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-project-context-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const eventTypes: string[] = []
  let step = 0
  const context = createNexumProjectContextPort({
    sources: [{ sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md" }],
    readFile: async () => "必须先读取项目规范",
  })
  const compaction: ContextCompactionPort = {
    estimate: (messages) => (messages.length >= 4 ? 100 : 1),
    async compact() {
      return { summary: "任务摘要", recentMessages: [], context: [] }
    },
  }
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      step += 1
      if (step === 1) {
        yield { type: "tool-call", toolCallID: "call_read_001", toolName: "read", toolInput: { path: "README.md" } }
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
  const events: EventSink = {
    async publish(event) {
      eventTypes.push(event.type)
    },
  }

  await createNexumCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events,
    projectContext: context,
    contextCompaction: compaction,
    compactionThreshold: 10,
  }).run({ sessionID: session.sessionID, text: "请读取 README.md" })

  expect(prompts[0]?.messages?.filter((message) => message.role === "system")).toEqual([
    { role: "system", content: "Project context from AGENTS.md\n必须先读取项目规范", sourceID: "instruction:project" },
  ])
  expect(prompts[0]?.messages?.[0]).toEqual({
    role: "system",
    content: "Project context from AGENTS.md\n必须先读取项目规范",
    sourceID: "instruction:project",
  })
  expect(prompts[1]?.messages?.filter((message) => message.role === "system")).toEqual([
    { role: "system", content: "Context summary:\n任务摘要", sourceID: "context:summary" },
    { role: "system", content: "Project context from AGENTS.md\n必须先读取项目规范", sourceID: "instruction:project" },
  ])
  expect(eventTypes).toEqual([
    "context.project.loaded",
    "tool.request",
    "tool.result",
    "context.compaction.started",
    "context.compaction.completed",
    "context.project.loaded",
    "session.completed",
    "run.settled",
  ])
})
