import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js"
import { McpError, type McpConnection, type McpConnector, type McpServerConfig, type McpToolCall, type ToolResult } from "@nexum/core"

export interface McpSdkConnectorOptions {
  readonly clientName?: string
  readonly clientVersion?: string
  readonly fetch?: FetchLike
  readonly oauth?: (config: McpServerConfig) => OAuthClientProvider | undefined
  readonly onAuthorizationRequired?: (config: McpServerConfig) => void | Promise<void>
}

/** 使用官方 MCP TypeScript SDK 创建远程 Streamable HTTP 连接。 */
export function createMcpSdkConnector(options: McpSdkConnectorOptions = {}): McpConnector {
  return {
    async connect(config, signal) {
      const toolsChanged = new Set<() => void>()
      const closed = new Set<() => void>()
      const client = new Client(
        { name: options.clientName ?? "nexum", version: options.clientVersion ?? "0.0.1" },
        {
          capabilities: { roots: { listChanged: true } },
          listChanged: {
            tools: {
              onChanged: (error) => {
                if (!error) toolsChanged.forEach((listener) => listener())
              },
            },
          },
        },
      )
      const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        authProvider: options.oauth?.(config),
        fetch: options.fetch,
        requestInit: {
          signal,
          ...(config.headers ? { headers: config.headers } : {}),
        },
        reconnectionOptions: {
          maxReconnectionDelay: 10_000,
          initialReconnectionDelay: 500,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 2,
        },
      })
      transport.onclose = () => closed.forEach((listener) => listener())
      signal.addEventListener("abort", () => void transport.close(), { once: true })
      try {
        await client.connect(transport)
        return createConnection(client, transport, toolsChanged, closed)
      } catch (error) {
        await transport.close()
        if (error instanceof UnauthorizedError) {
          await options.onAuthorizationRequired?.(config)
          throw new McpError("needs_auth", "MCP OAuth 需要用户授权")
        }
        throw error
      }
    },
  }
}

function createConnection(
  client: Client,
  transport: StreamableHTTPClientTransport,
  toolsChanged: Set<() => void>,
  closed: Set<() => void>,
): McpConnection {
  return {
    async listTools() {
      const result = await client.listTools()
      return result.tools.map((tool) => ({
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema,
      }))
    },
    async listResources() {
      const result = await client.listResources()
      return result.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        ...(resource.description ? { description: resource.description } : {}),
        ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
      }))
    },
    async listPrompts() {
      const result = await client.listPrompts()
      return result.prompts.map((prompt) => ({
        name: prompt.name,
        ...(prompt.description ? { description: prompt.description } : {}),
        ...(prompt.arguments ? { arguments: prompt.arguments.map((argument) => argument.name) } : {}),
      }))
    },
    async callTool(input: McpToolCall): Promise<ToolResult> {
      const result = await client.callTool({ name: input.toolName, arguments: input.input }, undefined, { signal: input.signal })
      return { ok: !isRecord(result) || result.isError !== true, output: stringifyToolResult(result) }
    },
    async close() {
      await client.close()
      await transport.close()
    },
    onToolsChanged(listener) {
      toolsChanged.add(listener)
      return () => toolsChanged.delete(listener)
    },
    onClose(listener) {
      closed.add(listener)
      return () => closed.delete(listener)
    },
  }
}

function stringifyToolResult(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return stringifyValue(result)
  const content = result.content.map(stringifyContent).filter((item) => item.length > 0)
  const structured = result.structuredContent ? stringifyValue(result.structuredContent) : ""
  return [...content, structured].filter((item) => item.length > 0).join("\n") || "MCP 工具未返回内容"
}

function stringifyContent(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== "string") return stringifyValue(value)
  if (value.type === "text" && typeof value.text === "string") return value.text
  if ((value.type === "image" || value.type === "audio") && typeof value.mimeType === "string") {
    return `[${value.type}: ${value.mimeType}]`
  }
  if (value.type === "resource" && isRecord(value.resource) && typeof value.resource.uri === "string") {
    return `[resource: ${value.resource.uri}]`
  }
  if (value.type === "resource_link" && typeof value.uri === "string") return `[resource: ${value.uri}]`
  return stringifyValue(value)
}

function stringifyValue(value: unknown): string {
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
