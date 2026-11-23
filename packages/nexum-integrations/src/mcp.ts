/**
 * 可选 MCP JSON-RPC Adapter。
 *
 * 传输由宿主提供，因此 HTTP、stdio、桌面 IPC 或企业网关都可以复用同一映射。
 */

import type { McpPort, McpPrompt, McpResource, McpServer, McpTool, McpToolCall, ToolResult } from "@nexum/core"

export interface McpRpcTransport {
  readonly request: (method: string, params?: Record<string, unknown>) => Promise<unknown>
  readonly close?: () => Promise<void>
}

export interface McpAdapterOptions {
  readonly server: McpServer
  readonly transport: McpRpcTransport
}

export function createMcpAdapter(options: McpAdapterOptions): McpPort {
  return {
    async listServers() {
      return [options.server]
    },
    async listTools(serverID) {
      assertServer(serverID, options.server)
      const result = await options.transport.request("tools/list")
      return readArray<McpTool>(result, "tools")
    },
    async listResources(serverID) {
      assertServer(serverID, options.server)
      const result = await options.transport.request("resources/list")
      return readArray<McpResource>(result, "resources")
    },
    async listPrompts(serverID) {
      assertServer(serverID, options.server)
      const result = await options.transport.request("prompts/list")
      return readArray<McpPrompt>(result, "prompts")
    },
    async callTool(input: McpToolCall): Promise<ToolResult> {
      assertServer(input.serverID, options.server)
      const result = await options.transport.request("tools/call", { name: input.toolName, arguments: input.input })
      return { ok: true, output: stringifyResult(result) }
    },
  }
}

export function createHttpMcpAdapter(options: McpAdapterOptions): McpPort {
  return createMcpAdapter(options)
}

export function createStdioMcpAdapter(options: McpAdapterOptions): McpPort {
  return createMcpAdapter(options)
}

function assertServer(serverID: string, server: McpServer): void {
  if (serverID !== server.id) throw new Error("MCP Server 不存在")
  if (server.status !== "available") throw new Error("MCP Server 不可用")
}

function readArray<T>(value: unknown, key: string): readonly T[] {
  if (!isRecord(value) || !Array.isArray(value[key])) return []
  return value[key] as T[]
}

function stringifyResult(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return "MCP 响应无法序列化"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
