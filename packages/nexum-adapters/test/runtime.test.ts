import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createEmbeddedRuntime,
  createFileMemory,
  createHttpMcpAdapter,
  createLocalHostAdapter,
  createLocalRuntime,
  createNexumModelConfigStore,
  createOpenAICompatibleModelPort,
} from "../src/index.ts"
import type { ModelPort } from "@nexum/core"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("creates an embedded runtime with memory, host and event capabilities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-runtime-"))
  directories.push(directory)
  const model: ModelPort = {
    async *prompt() {
      yield { type: "text", content: "完成" }
      yield { type: "completed" }
    },
  }
  const runtime = createEmbeddedRuntime({ model })
  const session = await runtime.sessions.create({ directory })

  expect(runtime.capabilities().find((item) => item.id === "memory")?.status).toBe("enabled")
  expect(runtime.capabilities().find((item) => item.id === "mcp")?.status).toBe("disabled")
  expect((await runtime.prompt({ sessionID: session.sessionID, text: "开始" })).status).toBe("completed")
  await runtime.close()
})

test("local host refuses paths outside the session directory", async () => {
  const host = createLocalHostAdapter()
  const result = await host.readText({ directory: "/tmp/nexum", path: "../outside.txt" })
  expect(result).toEqual({ ok: false, output: "工具资源必须位于 Session 工作目录内" })
})

test("creates a file-backed local runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-local-"))
  directories.push(directory)
  const runtime = createLocalRuntime({ dataDirectory: join(directory, ".nexum") })
  expect(runtime.eventHub).toBeDefined()
  expect(runtime.sessionService).toBeDefined()
  await runtime.close()
})

test("persists Skill registrations in the local runtime data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-local-skill-"))
  directories.push(directory)
  const skillRoot = join(directory, "metric-view-lifecycle")
  const dataDirectory = join(directory, ".nexum")
  await mkdir(skillRoot, { recursive: true })
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: metric-view-lifecycle\ndescription: test\n---\n")

  const first = createLocalRuntime({ dataDirectory })
  await expect(first.skillRegistry.register(skillRoot)).resolves.toMatchObject({ id: "metric-view-lifecycle", status: "ready" })
  await first.close()

  const second = createLocalRuntime({ dataDirectory })
  await second.skillRegistry.refresh()
  await expect(second.skillRegistry.list()).resolves.toMatchObject([{ id: "metric-view-lifecycle", status: "ready" }])
  await second.close()
})

test("persists memory through the local adapter and maps optional MCP resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-memory-"))
  directories.push(directory)
  const memory = createFileMemory({ filePath: join(directory, "memory.json") })
  await memory.upsert({ id: "one", namespace: "session", content: "remember this" })
  const reopened = createFileMemory({ filePath: join(directory, "memory.json") })
  expect(await reopened.search({ text: "remember" })).toHaveLength(1)

  const mcp = createHttpMcpAdapter({
    server: { id: "server", name: "Test MCP", status: "available" },
    transport: {
      async request(method) {
        if (method === "tools/list") return { tools: [{ name: "search" }] }
        if (method === "resources/list") return { resources: [{ uri: "file://one", name: "one" }] }
        if (method === "prompts/list") return { prompts: [{ name: "summarize" }] }
        return { content: [{ type: "text", text: "ok" }] }
      },
    },
  })
  expect(await mcp.listTools("server")).toEqual([{ name: "search" }])
  expect(await mcp.listResources("server")).toEqual([{ uri: "file://one", name: "one" }])
  expect(await mcp.listPrompts("server")).toEqual([{ name: "summarize" }])
  expect(await mcp.callTool({ serverID: "server", toolName: "search", input: {} })).toMatchObject({ ok: true })
})

test("streams reasoning deltas before visible text", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example/v1", model: "reasoning-model", credential: "secret" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () =>
      new Response(
        [
          'data: {"choices":[{"delta":{"reasoning_content":"先检查环境。"}}]}',
          'data: {"choices":[{"delta":{"content":"开始执行。"}}]}',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          "data: [DONE]",
          "",
        ].join("\n\n"),
        { headers: { "content-type": "text/event-stream" } },
      ),
  })

  const chunks = []
  for await (const chunk of model.prompt({ sessionID: "session", text: "开始" })) chunks.push(chunk)

  expect(chunks).toEqual([
    { type: "reasoning", reasoningContent: "先检查环境。" },
    { type: "text", content: "开始执行。" },
    { type: "completed", finishReason: "stop" },
  ])
})
