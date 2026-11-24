import { describe, expect, test } from "bun:test"
import type { NexumMcpServer } from "@nexum/client"
import { mergeMcpServers, mcpStatusLabel } from "../src/mcp-state"

const connected: NexumMcpServer = {
  id: "remote",
  name: "Remote MCP",
  status: "connected",
  url: "https://mcp.example.test/server",
}

describe("MCP state", () => {
  test("preserves unchanged rows and list references", () => {
    const current = [connected]

    expect(mergeMcpServers(current, [connected])).toBe(current)
    expect(mergeMcpServers(current, [{ ...connected }])).toBe(current)
  })

  test("replaces changed rows while retaining the other rows", () => {
    const other: NexumMcpServer = { id: "local", name: "Local MCP", status: "pending" }
    const current = [connected, other]
    const next = mergeMcpServers(current, [
      { ...connected, status: "retrying", retryAttempt: 1, nextRetryAt: 1 },
      other,
    ])

    expect(next).not.toBe(current)
    expect(next[0]).not.toBe(connected)
    expect(next[1]).toBe(other)
  })

  test("labels retry and authorization states for the control surface", () => {
    expect(mcpStatusLabel("retrying")).toBe("重试中")
    expect(mcpStatusLabel("needs_auth")).toBe("等待授权")
  })
})
