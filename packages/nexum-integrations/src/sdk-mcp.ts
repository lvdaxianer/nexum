import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { lookup } from "node:dns/promises"
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js"
import { isUnsafeMcpHostname, McpError, type McpConnection, type McpConnector, type McpServerConfig, type McpToolCall, type ToolResult } from "@nexum/core"

export interface McpSdkConnectorOptions {
  readonly clientName?: string
  readonly clientVersion?: string
  readonly fetch?: FetchLike
  readonly lookup?: McpLookup
  readonly oauth?: (config: McpServerConfig) => OAuthClientProvider | undefined
  readonly onAuthorizationRequired?: (config: McpServerConfig) => void | Promise<void>
}

type McpLookup = (hostname: string, options: { readonly all: true; readonly verbatim: true }) => Promise<readonly { readonly address: string; readonly family: number }[]>

/** 使用官方 MCP TypeScript SDK 创建远程 Streamable HTTP 连接。 */
export function createMcpSdkConnector(options: McpSdkConnectorOptions = {}): McpConnector {
  return {
    connect: (config, signal) => config.transport === "stdio" ? connectStdio(config, signal) : connectHttp(config, signal, options),
  }
}

/**
 * 连接本地 stdio MCP Server。
 *
 * @param config - 本地 MCP Server 配置
 * @param signal - 连接取消信号
 * @returns 已完成初始化的 MCP 连接
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
async function connectStdio(config: Extract<McpServerConfig, { transport: "stdio" }>, signal: AbortSignal): Promise<McpConnection> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: [...config.args],
    ...(config.cwd ? { cwd: config.cwd } : {}),
    ...(config.env ? { env: { ...config.env } } : {}),
    stderr: "inherit",
  })
  return connectClient(transport, signal)
}

/**
 * 连接远程 HTTP MCP Server。
 *
 * @param config - 远程 MCP Server 配置
 * @param signal - 连接取消信号
 * @param options - SDK Connector 配置
 * @returns 已完成初始化的 MCP 连接
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
async function connectHttp(
  config: Extract<McpServerConfig, { transport?: "http" }>,
  signal: AbortSignal,
  options: McpSdkConnectorOptions,
): Promise<McpConnection> {
  const resolveHost: McpLookup = options.lookup ?? ((hostname, lookupOptions) => lookup(hostname, lookupOptions))
  await assertSafeMcpTarget(config, resolveHost)
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    authProvider: options.oauth?.(config),
    fetch: options.fetch,
    requestInit: { signal, ...(config.headers ? { headers: config.headers } : {}) },
    reconnectionOptions: { maxReconnectionDelay: 10_000, initialReconnectionDelay: 500, reconnectionDelayGrowFactor: 1.5, maxRetries: 2 },
  })
  try {
    return await connectClient(transport, signal, options)
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await options.onAuthorizationRequired?.(config)
      throw new McpError("needs_auth", "MCP OAuth 需要用户授权")
    }
    throw error
  }
}

/**
 * 创建 Client、安装变化监听并完成 MCP 初始化。
 *
 * @param transport - MCP SDK 传输实现
 * @param signal - 连接取消信号
 * @returns 已完成初始化的 MCP 连接
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
async function connectClient(transport: Transport, signal: AbortSignal, options?: McpSdkConnectorOptions): Promise<McpConnection> {
  const toolsChanged = new Set<() => void>()
  const closed = new Set<() => void>()
  const client = createClient(toolsChanged, options)
  transport.onclose = () => closed.forEach((listener) => listener())
  signal.addEventListener("abort", () => void transport.close(), { once: true })
  try {
    await client.connect(transport)
    return createConnection(client, transport, toolsChanged, closed)
  } catch (error) {
    await transport.close()
    throw error
  }
}

/**
 * 创建支持工具目录变化通知的 MCP Client。
 *
 * @param toolsChanged - 工具目录变化监听集合
 * @param options - 可选的 Client 名称与版本配置
 * @returns 配置完成的 MCP Client
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function createClient(toolsChanged: Set<() => void>, options?: McpSdkConnectorOptions): Client {
  return new Client(
    { name: options?.clientName ?? "nexum", version: options?.clientVersion ?? "0.0.1" },
    {
      capabilities: { roots: { listChanged: true } },
      listChanged: { tools: { onChanged: (error) => { if (!error) toolsChanged.forEach((listener) => listener()) } } },
    },
  )
}

async function assertSafeMcpTarget(config: Extract<McpServerConfig, { transport?: "http" }>, resolveHost: McpLookup): Promise<void> {
  let url: URL
  try {
    url = new URL(config.url)
  } catch {
    throw new McpError("invalid_config", "MCP Server URL 无效")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new McpError("invalid_config", "MCP Server URL 必须是 HTTP(S) 地址")
  if (url.username || url.password || url.search || url.hash || isUnsafeMcpHostname(url.hostname)) {
    throw new McpError("invalid_config", "MCP Server URL 不允许访问本地资源或携带隐藏状态")
  }
  const addresses = await resolveHost(url.hostname, { all: true, verbatim: true }).catch(() => [])
  if (addresses.length === 0) throw new McpError("connection_failed", "MCP Server 地址无法解析")
  if (addresses.some((address) => isUnsafeMcpHostname(address.address))) {
    throw new McpError("invalid_config", "MCP Server URL 不允许访问本地资源")
  }
}

function createConnection(
  client: Client,
  transport: Transport,
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
