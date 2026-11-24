import { expect, test } from "bun:test"
import { createNexumToolRegistry } from "../src/index.ts"
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
