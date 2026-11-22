/**
 * MCP 的可选 Core 端口。
 *
 * MCP 未配置时 Runtime 仍可运行；具体传输和协议细节由 Adapter 负责。
 */

import type { ToolResult } from "./index.js"

export interface McpServer {
  readonly id: string
  readonly name: string
  readonly status: "available" | "unavailable"
}

export interface McpToolCall {
  readonly serverID: string
  readonly toolName: string
  readonly input: Record<string, unknown>
}

export interface McpTool {
  readonly name: string
  readonly description?: string
  readonly inputSchema?: Record<string, unknown>
}

export interface McpResource {
  readonly uri: string
  readonly name: string
  readonly description?: string
  readonly mimeType?: string
}

export interface McpPrompt {
  readonly name: string
  readonly description?: string
  readonly arguments?: readonly string[]
}

export interface McpPort {
  readonly listServers: () => Promise<readonly McpServer[]>
  readonly listTools: (serverID: string) => Promise<readonly McpTool[]>
  readonly listResources: (serverID: string) => Promise<readonly McpResource[]>
  readonly listPrompts: (serverID: string) => Promise<readonly McpPrompt[]>
  readonly callTool: (input: McpToolCall) => Promise<ToolResult>
}
