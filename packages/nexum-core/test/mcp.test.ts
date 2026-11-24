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
  await expect(registry.connect(config.id)).resolves.toMatchObject({ status: "connected" })
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
  await expect(failed.connect(config.id)).resolves.toMatchObject({ status: "retrying", retryAttempt: 1 })
  expect((await failed.get(config.id))?.error?.message).not.toContain("secret-token")
  await failed.close()
  await failed.close()
})

test("stops retrying after the bounded connection budget", async () => {
  let calls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        throw new Error("permanent network failure")
      },
    },
    autoConnect: false,
  })
  await registry.register(config)
  await registry.connect(config.id)
  await Bun.sleep(4500)

  await expect(registry.get(config.id)).resolves.toMatchObject({ status: "failed" })
  expect(calls).toBe(4)
  expect((await registry.get(config.id))?.retryAttempt).toBeUndefined()
  expect((await registry.get(config.id))?.nextRetryAt).toBeUndefined()
  await registry.close()
})

test("retries an initial connection failure and resets the retry snapshot after recovery", async () => {
  let calls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        if (calls === 1) throw new Error("temporary network failure")
        return connection()
      },
    },
    autoConnect: false,
  })
  await registry.register(config)

  await expect(registry.connect(config.id)).resolves.toMatchObject({
    status: "retrying",
    retryAttempt: 1,
    nextRetryAt: expect.any(Number),
  })
  await Bun.sleep(400)

  await expect(registry.get(config.id)).resolves.toMatchObject({ status: "connected" })
  expect(calls).toBe(2)
  expect((await registry.get(config.id))?.retryAttempt).toBeUndefined()
  expect((await registry.get(config.id))?.nextRetryAt).toBeUndefined()
  await registry.close()
})

test("does not retry an OAuth-required connection", async () => {
  let calls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        throw new McpError("needs_auth", "授权需要用户操作")
      },
    },
    autoConnect: false,
  })
  await registry.register(config)

  await expect(registry.connect(config.id)).resolves.toMatchObject({ status: "needs_auth" })
  await Bun.sleep(350)

  expect(calls).toBe(1)
  await registry.close()
})

test("does not retry an invalid connection configuration", async () => {
  let calls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        throw new McpError("invalid_config", "MCP transport 配置无效")
      },
    },
    autoConnect: false,
  })
  await registry.register(config)

  await expect(registry.connect(config.id)).resolves.toMatchObject({ status: "failed" })
  await Bun.sleep(350)

  expect(calls).toBe(1)
  await registry.close()
})

test("cancels an initial retry when the server is disconnected", async () => {
  let calls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        throw new Error("temporary network failure")
      },
    },
    autoConnect: false,
  })
  await registry.register(config)
  await expect(registry.connect(config.id)).resolves.toMatchObject({ status: "retrying" })
  await registry.disconnect(config.id)
  await Bun.sleep(400)

  expect(calls).toBe(1)
  expect((await registry.get(config.id))?.status).toBe("disabled")
  await registry.close()
})

test("reconnects once after an unexpected close and emits catalog changes", async () => {
  let calls = 0
  let onClose: (() => void) | undefined
  let onToolsChanged: (() => void) | undefined
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        return connection({
          onClose: (listener) => {
            onClose = listener
            return () => {}
          },
          onToolsChanged: (listener) => {
            onToolsChanged = listener
            return () => {}
          },
        })
      },
    },
    autoConnect: false,
  })
  let changes = 0
  const unsubscribe = registry.subscribeToolsChanged((serverID) => {
    if (serverID === config.id) changes += 1
  })
  await registry.register(config)
  await registry.connect(config.id)
  onToolsChanged?.()
  onClose?.()
  await Bun.sleep(600)

  expect(changes).toBe(1)
  expect(calls).toBe(2)
  unsubscribe()
  await registry.close()
})

test("reconnects once when a tool call reports an expired MCP session", async () => {
  let calls = 0
  let toolCalls = 0
  const registry = createMcpRegistry({
    connector: {
      connect: async () => {
        calls += 1
        return connection({
          callTool: async () => {
            toolCalls += 1
            if (toolCalls === 1) throw new Error("MCP session expired")
            return { ok: true, output: "recovered" }
          },
        })
      },
    },
    autoConnect: false,
  })
  await registry.register(config)
  await registry.connect(config.id)

  await expect(registry.callTool({ serverID: config.id, toolName: "search", input: {} })).resolves.toEqual({
    ok: true,
    output: "recovered",
  })
  expect(calls).toBe(2)
})
