import { expect, test } from "bun:test"
import { createNexumToolRegistry } from "../src/index.ts"
import { createNexumLocalFunctionRegistry } from "../src/local-functions.ts"
import { type McpPort } from "@nexum/core"
import { createNexumSessionService } from "../../nexum-core/test/test-ports.ts"
import { normalizeNexumToolRequest } from "@nexum/core"

test("registers namespaced MCP tools and passes session context through calls", async () => {
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: process.cwd() })
  const calls: Array<{ serverID: string; toolName: string; input: Record<string, unknown>; sessionID?: string }> = []
  const mcp: McpPort = {
    async listServers() {
      return [{ id: "remote", name: "Remote MCP", status: "connected" }]
    },
    async listTools() {
      return [{ name: "search", description: "Search", inputSchema: { type: "object" } }]
    },
    async listResources() { return [] },
    async listPrompts() { return [] },
    async callTool(input) {
      calls.push(input)
      return { ok: true, output: "found" }
    },
  }

  const registry = createNexumToolRegistry({ sessions, mcp })
  await registry.ready

  expect(registry.names).toContain("mcp__remote_mcp__search")
  expect(registry.definitions.find((item) => item.name === "mcp__remote_mcp__search")).toMatchObject({
    parameters: { type: "object" },
  })
  await expect(
    registry.port.execute(normalizeNexumToolRequest(session.sessionID, "mcp__remote_mcp__search", { query: "nexum" })),
  ).resolves.toEqual({ ok: true, output: "found" })
  expect(calls).toEqual([{ serverID: "remote", toolName: "search", input: { query: "nexum" }, sessionID: session.sessionID }])
})

test("debounces MCP catalog changes into a refreshed definition set", async () => {
  let notify: (() => void) | undefined
  let tools = [{ name: "search" }]
  const mcp: McpPort = {
    async listServers() { return [{ id: "remote", name: "Remote", status: "connected" }] },
    async listTools() { return tools },
    async listResources() { return [] },
    async listPrompts() { return [] },
    async callTool() { return { ok: true, output: "ok" } },
    subscribeToolsChanged(listener) {
      notify = () => listener("remote")
      return () => {}
    },
  }
  const registry = createNexumToolRegistry({ sessions: createNexumSessionService(), mcp })
  await registry.ready
  tools = [{ name: "lookup" }]
  notify?.()
  await Bun.sleep(100)

  expect(registry.names).toContain("mcp__remote__lookup")
  expect(registry.names).not.toContain("mcp__remote__search")
})

test("adds local JS functions to the same model tool catalog and executes them", async () => {
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: process.cwd() })
  const localFunctions = createNexumLocalFunctionRegistry([{
    providerID: "local-tools",
    providerName: "Local Tools",
    functions: [{
      name: "echo",
      description: "Echo input",
      parameters: { type: "object", required: ["value"], properties: { value: { type: "string" } } },
      execute: async (input) => input.value,
    }],
  }])
  const registry = createNexumToolRegistry({ sessions, localFunctions })

  expect(registry.names).toContain("local__local_tools__echo")
  await expect(registry.port.execute(normalizeNexumToolRequest(session.sessionID, "local__local_tools__echo", { value: "hello" }))).resolves.toEqual({
    ok: true,
    output: "hello",
  })

  localFunctions.register({
    providerID: "local-tools",
    providerName: "Local Tools",
    functions: [{
      name: "lookup",
      description: "Lookup input",
      parameters: { type: "object", properties: { value: { type: "string" } } },
      execute: async (input) => input.value,
    }],
  })
  expect(registry.names).toContain("local__local_tools__lookup")
})
