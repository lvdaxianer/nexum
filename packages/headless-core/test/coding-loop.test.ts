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
