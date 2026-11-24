import { expect, test } from "bun:test"
import {
  createMcpRegistry,
  McpError,
  type McpConnection,
  type McpServerConfig,
} from "../src/index.ts"

const config: McpServerConfig = {
  id: "remote",
  name: "Remote MCP",
  url: "https://mcp.example.test/server",
}

function connection(overrides: Partial<McpConnection> = {}): McpConnection {
  return {
    listTools: async () => [],
    listResources: async () => [],
    listPrompts: async () => [],
    callTool: async () => ({ ok: true, output: "ok" }),
    close: async () => {},
    ...overrides,
  }
}

test("registers remote servers and rejects invalid or duplicate definitions", async () => {
  const registry = createMcpRegistry({ connector: { connect: async () => connection() }, autoConnect: false })

  await expect(registry.register(config)).resolves.toMatchObject({
    id: "remote",
    name: "Remote MCP",
    status: "pending",
  })
  await expect(registry.register({ ...config, id: "other", name: "", url: "file:///tmp/mcp" })).rejects.toMatchObject({
    code: "invalid_config",
  })
  await expect(registry.register(config)).rejects.toMatchObject({ code: "server_exists" })
})

test("connects once, exposes a connected snapshot, and delegates MCP operations", async () => {
  let calls = 0
  const tools = [{ name: "search", description: "Search", inputSchema: { type: "object" } }]
  const session = connection({ listTools: async () => tools })
  const registry = createMcpRegistry({
    connector: {
      connect: async (input) => {
        calls += 1
        expect(input.url).toBe(config.url)
        return session
      },
    },
    autoConnect: false,
  })
  await registry.register(config)

  const [first, second] = await Promise.all([registry.connect(config.id), registry.connect(config.id)])

  expect(calls).toBe(1)
  expect(first.status).toBe("connected")
  expect(second.status).toBe("connected")
  expect(await registry.listTools(config.id)).toEqual(tools)
})

test("does not let a stale connection win after disconnect", async () => {
  let resolveConnection: (value: McpConnection) => void = () => {}
  let closed = 0
  const pending = new Promise<McpConnection>((resolve) => {
    resolveConnection = resolve
  })
  const registry = createMcpRegistry({
    connector: { connect: async () => pending },
    autoConnect: false,
  })
  await registry.register(config)

  const connecting = registry.connect(config.id)
  await registry.disconnect(config.id)
  resolveConnection(connection({ close: async () => { closed += 1 } }))
  await connecting

  expect((await registry.get(config.id))?.status).toBe("disabled")
  expect(closed).toBe(1)
})

test("stores a safe failure summary and closes owned connections idempotently", async () => {
  let closed = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => connection({ close: async () => { closed += 1 } }),
    },
    autoConnect: false,
  })
  await registry.register(config)
  await registry.connect(config.id)
  await registry.disconnect(config.id)
  await registry.disconnect(config.id)
  expect(closed).toBe(1)

  const failed = createMcpRegistry({
    connector: {
      connect: async () => {
        throw new McpError("connection_failed", "Authorization: Bearer secret-token")
      },
    },
    autoConnect: false,
  })
  await failed.register(config)
  await expect(failed.connect(config.id)).resolves.toMatchObject({ status: "failed" })
  expect((await failed.get(config.id))?.error?.message).not.toContain("secret-token")
  await failed.close()
  await failed.close()
})
