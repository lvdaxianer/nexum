import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createEmbeddedRuntime,
  createLocalRuntime,
  createNexumToolRegistry,
} from "../src/index.ts"
import {
  createFileMemory,
  createFileRolePromptStore,
  createInMemoryMcpServerConfigStore,
  createMemoryPersistence,
  createInMemorySessionStore,
  createNexumModelConfigStore,
} from "../../nexum-persistence/src/index.ts"
import { createHttpMcpAdapter, createLocalHostAdapter, createOpenAICompatibleModelPort } from "../../nexum-integrations/src/index.ts"
import { createNexumSessionService, type McpConnection, type McpServerConfigStore, type ModelPort } from "@nexum/core"

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

test("uses an injected persistence composition for embedded runtime stores", async () => {
  const persistence = createMemoryPersistence()
  const runtime = createEmbeddedRuntime({ persistence })

  expect(runtime.sessionService).toBeDefined()
  expect(runtime.messageStore).toBe(persistence.messageStore)
  expect(runtime.interactionStore).toBe(persistence.interactionStore)
  expect(runtime.eventHub).toBe(persistence.eventHub)
  expect(runtime.modelConfig).toBe(persistence.modelConfig)
  await runtime.close()
})

test("local host refuses paths outside the session directory", async () => {
  const host = createLocalHostAdapter()
  const result = await host.readText({ directory: "/tmp/nexum", path: "../outside.txt" })
  expect(result).toEqual({ ok: false, output: "工具资源必须位于 Session 工作目录内" })
})

test("tool registry fallback shell settles a hanging command", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-registry-shell-"))
  directories.push(directory)
  const sessions = createNexumSessionService({ store: createInMemorySessionStore() })
  const session = await sessions.create({ directory })
  const registry = createNexumToolRegistry({ sessions, shellTimeoutMs: 20, shellCleanupTimeoutMs: 20 })

  const result = await registry.port.execute({
    sessionID: session.sessionID,
    toolName: "shell",
    action: "shell",
    resource: "sleep 30 & wait",
    input: { command: "sleep 30 & wait" },
  })

  expect(result).toMatchObject({ ok: false, errorCode: "timeout", status: "timeout" })
})

test("creates a file-backed local runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-local-"))
  directories.push(directory)
  const runtime = createLocalRuntime({ dataDirectory: join(directory, ".nexum") })
  expect(runtime.eventHub).toBeDefined()
  expect(runtime.sessionService).toBeDefined()
  await runtime.close()
})

test("restores MCP configurations and starts enabled connections in the background", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-local-mcp-"))
  directories.push(directory)
  const configs = createInMemoryMcpServerConfigStore()
  await configs.save({ id: "enabled", name: "Enabled MCP", url: "https://enabled.example.test/mcp" })
  await configs.save({ id: "disabled", name: "Disabled MCP", url: "https://disabled.example.test/mcp", disabled: true })
  let calls = 0
  const runtime = createLocalRuntime({
    dataDirectory: join(directory, ".nexum"),
    mcpConfigStore: configs,
    mcpConnector: {
      async connect() {
        calls += 1
        return createConnection()
      },
    },
  })
  const mcp = runtime.mcp
  if (!mcp || !runtime.mcpReady) throw new Error("Local runtime MCP 未初始化")

  await runtime.mcpReady

  await Bun.sleep(0)
  await expect(mcp.listServers()).resolves.toMatchObject([
    { id: "disabled", status: "disabled" },
    { id: "enabled", status: "connected" },
  ])
  expect(calls).toBe(1)
  await runtime.close()
})

test("keeps an empty MCP configuration path network-free", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-empty-mcp-"))
  directories.push(directory)
  let calls = 0
  const runtime = createLocalRuntime({
    dataDirectory: join(directory, ".nexum"),
    mcpConfigStore: createInMemoryMcpServerConfigStore(),
    mcpConnector: {
      async connect() {
        calls += 1
        return createConnection()
      },
    },
  })
  const mcp = runtime.mcp
  if (!mcp || !runtime.mcpReady) throw new Error("Local runtime MCP 未初始化")

  await runtime.mcpReady

  await expect(mcp.listServers()).resolves.toEqual([])
  expect(calls).toBe(0)
  await runtime.close()
})

test("closes MCP startup retries with the local runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-mcp-close-"))
  directories.push(directory)
  const configs = createInMemoryMcpServerConfigStore()
  await configs.save({ id: "flaky", name: "Flaky MCP", url: "https://flaky.example.test/mcp" })
  let calls = 0
  const runtime = createLocalRuntime({
    dataDirectory: join(directory, ".nexum"),
    mcpConfigStore: configs,
    mcpConnector: {
      async connect() {
        calls += 1
        throw new Error("temporary network failure")
      },
    },
  })
  const mcp = runtime.mcp
  if (!mcp || !runtime.mcpReady) throw new Error("Local runtime MCP 未初始化")

  await runtime.mcpReady
  await Bun.sleep(20)
  await runtime.close()
  await Bun.sleep(400)

  expect(calls).toBe(1)
  await expect(mcp.listServers()).resolves.toMatchObject([{ id: "flaky", status: "disabled" }])
})

test("cancels MCP configuration restoration when the runtime closes first", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-mcp-restore-close-"))
  directories.push(directory)
  let release: (() => void) | undefined
  const configs = createInMemoryMcpServerConfigStore()
  await configs.save({ id: "late", name: "Late MCP", url: "https://late.example.test/mcp" })
  const delayedConfigs: McpServerConfigStore = {
    ...configs,
    list: () => new Promise((resolve) => {
      release = () => void configs.list().then(resolve)
    }),
  }
  const runtime = createLocalRuntime({ dataDirectory: join(directory, ".nexum"), mcpConfigStore: delayedConfigs })

  await runtime.close()
  release?.()

  await expect(runtime.mcpReady).resolves.toBeUndefined()
  expect(await runtime.mcp?.listServers()).toEqual([])
})

test("persists Skill registrations in the local runtime data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-local-skill-"))
  directories.push(directory)
  const skillRoot = join(directory, "metric-view-lifecycle")
  const dataDirectory = join(directory, ".nexum")
  await mkdir(skillRoot, { recursive: true })
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: metric-view-lifecycle\ndescription: test\n---\n")

  const first = createLocalRuntime({ dataDirectory, skillRoots: [directory] })
  await expect(first.skillRegistry.register(skillRoot)).resolves.toMatchObject({ id: "metric-view-lifecycle", status: "ready" })
  await first.close()

  const second = createLocalRuntime({ dataDirectory, skillRoots: [directory] })
  await second.skillRegistry.refresh()
  await expect(second.skillRegistry.list()).resolves.toMatchObject([{ id: "metric-view-lifecycle", status: "ready" }])
  await second.close()
})

test("persists and resets the default role prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-role-prompt-"))
  directories.push(directory)
  const filePath = join(directory, "role-prompt.json")
  const first = createFileRolePromptStore({ filePath })

  await expect(first.get()).resolves.toMatchObject({ source: "default" })
  await expect(first.update("思考过程和回答都使用中文。"))
    .resolves.toMatchObject({ prompt: "思考过程和回答都使用中文。", source: "custom" })
  await expect(first.update("  保留原始空格。  ")).resolves.toMatchObject({ prompt: "  保留原始空格。  " })
  await expect(first.update("   ")).rejects.toThrow("不能为空")

  const reopened = createFileRolePromptStore({ filePath })
  await expect(reopened.get()).resolves.toMatchObject({ prompt: "  保留原始空格。  ", source: "custom" })
  await expect(reopened.reset()).resolves.toMatchObject({ source: "default" })
  await expect(createFileRolePromptStore({ filePath }).get()).resolves.toMatchObject({ source: "default" })
})

test("persists memory through the local runtime and maps optional MCP resources", async () => {
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

function createConnection(): McpConnection {
  return {
    listTools: async () => [],
    listResources: async () => [],
    listPrompts: async () => [],
    callTool: async () => ({ ok: true, output: "ok" }),
    close: async () => {},
  }
}
