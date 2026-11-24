import { afterEach, expect, test } from "bun:test"
import { createMcpRegistry, type McpConnection, type McpOAuthAttempt, type McpOAuthControlPort, type McpServerConfigStore } from "@nexum/core"
import { createInMemoryMcpServerConfigStore } from "../../nexum-persistence/src/index.ts"
import { createLocalRuntime } from "@nexum/application"
import { startNexumServer, type NexumServer } from "../src/index.ts"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const servers: NexumServer[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("waits for local MCP config restoration without waiting for remote initialize", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-mcp-start-"))
  directories.push(directory)
  const configs = createInMemoryMcpServerConfigStore()
  await configs.save({ id: "slow", name: "Slow MCP", url: "https://slow.example.test/mcp" })
  const delayedConfigs: McpServerConfigStore = {
    ...configs,
    async list() {
      await Bun.sleep(50)
      return configs.list()
    },
  }
  let release: (() => void) | undefined
  const pending = new Promise<McpConnection>((resolve) => {
    release = () => resolve(createConnection())
  })
  const runtime = createLocalRuntime({
    dataDirectory: join(directory, ".nexum"),
    mcpConfigStore: delayedConfigs,
    mcpConnector: { connect: async () => pending },
  })

  const server = await startNexumServer({ port: 0, runtime })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/nexum/mcp", server.url))
  expect(await response.json()).toMatchObject({ data: [{ id: "slow" }] })
  release?.()
})

test("registers and controls a remote MCP server through the experimental API", async () => {
  const connection: McpConnection = {
    listTools: async () => [{ name: "search", description: "Search remote data", inputSchema: { type: "object" } }],
    listResources: async () => [{ uri: "resource://example", name: "Example", mimeType: "text/plain" }],
    listPrompts: async () => [{ name: "summarize", arguments: ["text"] }],
    callTool: async () => ({ ok: true, output: "done" }),
    close: async () => {},
  }
  const mcp = createMcpRegistry({
    autoConnect: false,
    connector: { connect: async () => connection },
  })
  const server = await startNexumServer({ port: 0, mcp })
  servers.push(server)

  const addResponse = await fetch(new URL("/api/experimental/nexum/mcp", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "remote-search", name: "Remote Search", url: "https://example.com/mcp" }),
  })
  const addBody = (await addResponse.json()) as { data: { id: string; status: string; url?: string } }
  const connectResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search/connect", server.url), {
    method: "POST",
  })
  const toolsResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search/tools", server.url))
  const resourcesResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search/resources", server.url))
  const promptsResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search/prompts", server.url))
  const capabilitiesResponse = await fetch(new URL("/api/nexum/capabilities", server.url))
  const capabilitiesBody = (await capabilitiesResponse.json()) as {
    data: { capabilities: Array<{ id: string; status: string }> }
  }
  const disconnectResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search/disconnect", server.url), {
    method: "POST",
  })
  const removeResponse = await fetch(new URL("/api/experimental/nexum/mcp/remote-search", server.url), { method: "DELETE" })

  expect(addResponse.status).toBe(200)
  expect(addBody.data).toMatchObject({ id: "remote-search", status: "pending", url: "https://example.com/mcp" })
  expect(connectResponse.status).toBe(200)
  expect((await toolsResponse.json()) as { data: unknown[] }).toMatchObject({ data: [{ name: "search" }] })
  expect((await resourcesResponse.json()) as { data: unknown[] }).toMatchObject({ data: [{ uri: "resource://example" }] })
  expect((await promptsResponse.json()) as { data: unknown[] }).toMatchObject({ data: [{ name: "summarize" }] })
  expect(capabilitiesBody.data.capabilities.find((capability) => capability.id === "mcp")).toMatchObject({ status: "enabled" })
  expect(disconnectResponse.status).toBe(200)
  expect(await removeResponse.json()).toMatchObject({ data: { id: "remote-search", deleted: true } })
})

test("does not expose MCP configuration headers through the public server view", async () => {
  const mcp = createMcpRegistry({ autoConnect: false, connector: { connect: async () => { throw new Error("unused") } } })
  const server = await startNexumServer({ port: 0, mcp })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/nexum/mcp", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "header-test",
      name: "Header Test",
      url: "https://example.com/mcp",
      headers: { authorization: "Bearer secret" },
    }),
  })

  const body = await response.text()
  expect(response.status).toBe(400)
  expect(body).not.toContain("Bearer secret")
})

test("exposes OAuth authorization attempts without returning credentials", async () => {
  const mcp = createMcpRegistry({ autoConnect: false, connector: { connect: async () => { throw new Error("unused") } } })
  await mcp.register({ id: "oauth-server", name: "OAuth Server", url: "https://oauth.example.com/mcp" })
  let attempt: McpOAuthAttempt = {
    id: "attempt-1",
    serverID: "oauth-server",
    status: "awaiting_user",
    authorizationUrl: "https://issuer.example.com/authorize?state=state-1",
    redirectUrl: "http://127.0.0.1:43123/oauth/callback",
    expiresAt: Date.now() + 60_000,
  }
  const oauth: McpOAuthControlPort = {
    async start() {
      return attempt
    },
    async status() {
      return attempt
    },
    async complete(_attemptID, redirectUrl) {
      expect(redirectUrl).toContain("code=code-1")
      attempt = { ...attempt, status: "authorized", authorizationUrl: undefined }
      return attempt
    },
    async cancel() {
      attempt = { ...attempt, status: "cancelled", authorizationUrl: undefined }
      return attempt
    },
  }
  const server = await startNexumServer({ port: 0, mcp, mcpOAuth: oauth })
  servers.push(server)

  const startResponse = await fetch(new URL("/api/experimental/nexum/mcp/oauth-server/oauth/authorize", server.url), {
    method: "POST",
    body: "{}",
  })
  const started = (await startResponse.json()) as { data: McpOAuthAttempt }
  const statusResponse = await fetch(new URL(`/api/experimental/nexum/mcp/oauth/${started.data.id}`, server.url))
  const completeResponse = await fetch(new URL(`/api/experimental/nexum/mcp/oauth/${started.data.id}/complete`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirectUrl: "http://127.0.0.1:43123/oauth/callback?code=code-1&state=state-1" }),
  })

  expect(startResponse.status).toBe(200)
  expect(started.data).toMatchObject({ status: "awaiting_user", serverID: "oauth-server" })
  expect(JSON.stringify(started)).not.toContain("token")
  expect(statusResponse.status).toBe(200)
  expect(completeResponse.status).toBe(200)
  expect(await completeResponse.json()).toMatchObject({ data: { status: "authorized" } })
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
