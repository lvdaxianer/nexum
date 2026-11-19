import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createHeadlessCodingLoop,
  createHeadlessModelConfigStore,
  createHeadlessPermissionBroker,
  createHeadlessSessionService,
  createOpenAICompatibleModelPort,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"

test("rejects malformed OpenAI Function Calling arguments without emitting a tool chunk", async () => {
  const config = createHeadlessModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () =>
      Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_invalid_001",
                  type: "function",
                  function: { name: "write", arguments: "{not-json" },
                },
              ],
            },
          },
        ],
      }),
  })

  const collect = async () => {
    const chunks = []
    for await (const chunk of model.prompt({ sessionID: "session-invalid", text: "写文件" })) chunks.push(chunk)
    return chunks
  }
  await expect(collect()).rejects.toMatchObject({ code: "invalid_response" })
})

test("rejects malformed Function Calling arguments with a stable model error", async () => {
  const config = createHeadlessModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () =>
      Response.json({
        choices: [
          { message: { tool_calls: [{ id: "call_invalid_002", function: { name: "read", arguments: "[]" } }] } },
        ],
      }),
  })

  const collect = async () => {
    for await (const _chunk of model.prompt({ sessionID: "session-invalid", text: "读文件" })) {
    }
  }
  await expect(collect()).rejects.toMatchObject({ code: "invalid_response" })
})

test("stops a multi-tool response at the first denied side effect", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-permission-matrix-"))
  const sessions = createHeadlessSessionService()
  const session = await sessions.create({ directory })
  const executed: string[] = []
  let permissionCalls = 0
  const model: ModelPort = {
    async *prompt() {
      yield {
        type: "tool-call",
        toolCalls: [
          { id: "call_read_001", name: "read", input: { path: "README.md" } },
          { id: "call_shell_001", name: "shell", input: { command: "touch forbidden" } },
        ],
      }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      permissionCalls += 1
      return permissionCalls === 1 ? "allow" : "deny"
    },
  }
  const tool: ToolPort = {
    async execute(request) {
      executed.push(request.toolName)
      return { ok: true, output: "read-only" }
    },
  }
  const events: EventSink = { async publish() {} }

  await expect(
    createHeadlessCodingLoop({ model, tool, permission, sessions, events }).run({
      sessionID: session.sessionID,
      text: "先读文件再执行命令",
    }),
  ).rejects.toThrow("工具请求被拒绝")
  expect(executed).toEqual(["read"])
  expect(await sessions.get(session.sessionID)).toMatchObject({ status: "failed" })
  await rm(directory, { recursive: true, force: true })
})

test("keeps permission approval scoped to the request session and validates decisions", async () => {
  const permission = createHeadlessPermissionBroker()
  const request = {
    sessionID: "session-permission-matrix",
    toolName: "read",
    action: "read",
    resource: "README.md",
    input: { path: "README.md" },
  }
  const evaluation = permission.evaluate(request)
  await Bun.sleep(0)
  const pending = (await permission.list(request.sessionID))[0]!

  await expect(
    permission.reply({ sessionID: "other-session", requestID: pending.id, decision: "allow_once" }),
  ).rejects.toMatchObject({ code: "session_mismatch" })
  await expect(
    permission.reply({ sessionID: request.sessionID, requestID: pending.id, decision: "invalid" as never }),
  ).rejects.toMatchObject({ code: "invalid_decision" })
  await permission.reply({ sessionID: request.sessionID, requestID: pending.id, decision: "deny" })
  await expect(evaluation).resolves.toBe("deny")
})
