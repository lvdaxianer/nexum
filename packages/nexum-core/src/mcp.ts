/**
 * MCP 的 Core 端口与生命周期状态机。
 *
 * Core 只描述生命周期和连接行为；具体 MCP 协议、HTTP transport、OAuth
 * 和凭据实现由上层 Integration 提供。
 */

import type { ToolResult } from "./index.js"

export type McpServerStatus = "disabled" | "pending" | "connected" | "failed" | "needs_auth"
export type McpLegacyServerStatus = "available" | "unavailable"
export type McpConnectionErrorCode =
  | "invalid_config"
  | "server_exists"
  | "server_not_found"
  | "server_not_connected"
  | "runtime_closed"
  | "connection_failed"
  | "needs_auth"

export interface McpErrorSummary {
  readonly code: McpConnectionErrorCode
  readonly message: string
}

export class McpError extends Error {
  constructor(readonly code: McpConnectionErrorCode, message: string) {
    super(safeMcpErrorMessage(message))
    this.name = "McpError"
  }
}

export interface McpServerConfig {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly disabled?: boolean
  readonly timeoutMs?: number
  readonly protocol?: "legacy" | "auto" | "2026-07-28"
}

export interface McpServerConfigStore {
  readonly list: () => Promise<readonly McpServerConfig[]>
  readonly get: (serverID: string) => Promise<McpServerConfig | undefined>
  readonly save: (config: McpServerConfig) => Promise<void>
  readonly remove: (serverID: string) => Promise<void>
}

export interface McpOAuthCredential {
  readonly serverID: string
  readonly accessToken?: string
  readonly refreshToken?: string
  readonly expiresAt?: number
  readonly tokenType?: string
  readonly scope?: string
  readonly resource?: string
  readonly clientId?: string
  readonly clientSecret?: string
  readonly issuer?: string
}

export interface McpCredentialStore {
  readonly get: (serverID: string) => Promise<McpOAuthCredential | undefined>
  readonly save: (credential: McpOAuthCredential) => Promise<void>
  readonly remove: (serverID: string) => Promise<void>
}

export interface McpServer {
  readonly id: string
  readonly name: string
  readonly status: McpServerStatus | McpLegacyServerStatus
  readonly url?: string
  readonly error?: McpErrorSummary
}

export interface McpToolCall {
  readonly serverID: string
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly sessionID?: string
  readonly signal?: AbortSignal
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

export interface McpConnection {
  readonly listTools: () => Promise<readonly McpTool[]>
  readonly listResources: () => Promise<readonly McpResource[]>
  readonly listPrompts: () => Promise<readonly McpPrompt[]>
  readonly callTool: (input: McpToolCall) => Promise<ToolResult>
  readonly close: () => Promise<void>
  readonly onToolsChanged?: (listener: () => void) => () => void
  readonly onClose?: (listener: () => void) => () => void
}

export interface McpConnector {
  readonly connect: (config: McpServerConfig, signal: AbortSignal) => Promise<McpConnection>
}

export interface McpPort {
  readonly listServers: () => Promise<readonly McpServer[]>
  readonly listTools: (serverID: string) => Promise<readonly McpTool[]>
  readonly listResources: (serverID: string) => Promise<readonly McpResource[]>
  readonly listPrompts: (serverID: string) => Promise<readonly McpPrompt[]>
  readonly callTool: (input: McpToolCall) => Promise<ToolResult>
  readonly close?: () => Promise<void>
}

export interface McpRegistry extends McpPort {
  readonly register: (config: McpServerConfig) => Promise<McpServer>
  readonly get: (serverID: string) => Promise<McpServer | undefined>
  readonly connect: (serverID: string) => Promise<McpServer>
  readonly disconnect: (serverID: string) => Promise<McpServer | undefined>
  readonly remove: (serverID: string) => Promise<void>
  readonly subscribe: (listener: (server: McpServer) => void) => () => void
  readonly subscribeToolsChanged: (listener: (serverID: string) => void) => () => void
  readonly close: () => Promise<void>
}

export interface McpRegistryOptions {
  readonly connector: McpConnector
  readonly autoConnect?: boolean
}

interface McpEntry {
  readonly config: McpServerConfig
  server: McpServer
  connection?: McpConnection
  generation: number
  operation?: {
    readonly generation: number
    readonly controller: AbortController
    readonly promise: Promise<McpServer>
  }
  cleanup?: () => void
  retryTimer?: ReturnType<typeof setTimeout>
  reconnectAttempts: number
}

export function createMcpRegistry(options: McpRegistryOptions): McpRegistry {
  let closed = false
  const entries = new Map<string, McpEntry>()
  const listeners = new Set<(server: McpServer) => void>()
  const catalogListeners = new Set<(serverID: string) => void>()

  const registry = {
    async register(config: McpServerConfig): Promise<McpServer> {
      assertOpen()
      const normalized = normalizeMcpServerConfig(config)
      if (entries.has(normalized.id)) throw new McpError("server_exists", `MCP Server 已存在: ${normalized.id}`)
      const entry: McpEntry = {
        config: normalized,
        server: snapshot(normalized, normalized.disabled ? "disabled" : "pending"),
        generation: 0,
        reconnectAttempts: 0,
      }
      entries.set(normalized.id, entry)
      publish(entry.server)
      if (normalized.disabled || options.autoConnect === false) return entry.server
      void registry.connect(normalized.id)
      return entry.server
    },

    async get(serverID: string): Promise<McpServer | undefined> {
      return entries.get(serverID)?.server
    },

    async listServers(): Promise<readonly McpServer[]> {
      return [...entries.values()].map((entry) => entry.server)
    },

    async connect(serverID: string): Promise<McpServer> {
      assertOpen()
      const entry = requireEntry(serverID)
      if (entry.config.disabled) {
        entry.server = snapshot(entry.config, "disabled")
        publish(entry.server)
        return entry.server
      }
      if (entry.server.status === "connected" && entry.connection) return entry.server
      if (entry.operation) return entry.operation.promise

      const generation = entry.generation + 1
      const controller = new AbortController()
      entry.generation = generation
      entry.server = snapshot(entry.config, "pending")
      publish(entry.server)
      const promise = options.connector
        .connect(entry.config, controller.signal)
        .then(async (connection) => {
          if (closed || entry.generation !== generation || controller.signal.aborted) {
            await closeQuietly(connection)
            return entry.server
          }
          entry.connection = connection
          entry.reconnectAttempts = 0
          entry.cleanup = watchConnection(entry, connection, generation)
          entry.server = snapshot(entry.config, "connected")
          publish(entry.server)
          return entry.server
        })
        .catch((error: unknown) => {
          if (closed || entry.generation !== generation || controller.signal.aborted) return entry.server
          entry.connection = undefined
          entry.server = {
            ...snapshot(entry.config, error instanceof McpError && error.code === "needs_auth" ? "needs_auth" : "failed"),
            error: summarizeMcpError(error),
          }
          publish(entry.server)
          return entry.server
        })
        .finally(() => {
          if (entry.operation?.generation === generation) entry.operation = undefined
        })
      entry.operation = { generation, controller, promise }
      return promise
    },

    async disconnect(serverID: string): Promise<McpServer | undefined> {
      const entry = entries.get(serverID)
      if (!entry) return undefined
      await stopEntry(entry)
      return entry.server
    },

    async remove(serverID: string): Promise<void> {
      const entry = entries.get(serverID)
      if (!entry) return
      await stopEntry(entry)
      entries.delete(serverID)
    },

    async listTools(serverID: string): Promise<readonly McpTool[]> {
      return requireConnection(serverID).listTools()
    },

    async listResources(serverID: string): Promise<readonly McpResource[]> {
      return requireConnection(serverID).listResources()
    },

    async listPrompts(serverID: string): Promise<readonly McpPrompt[]> {
      return requireConnection(serverID).listPrompts()
    },

    async callTool(input: McpToolCall): Promise<ToolResult> {
      const entry = requireEntry(input.serverID)
      try {
        return await requireConnection(input.serverID).callTool(input)
      } catch (error) {
        if (!isRecoverableConnectionError(error)) throw error
        await stopEntry(entry)
        await registry.connect(input.serverID)
        return requireConnection(input.serverID).callTool(input)
      }
    },

    subscribe(listener: (server: McpServer) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    subscribeToolsChanged(listener: (serverID: string) => void): () => void {
      catalogListeners.add(listener)
      return () => catalogListeners.delete(listener)
    },

    async close(): Promise<void> {
      if (closed) return
      closed = true
      await Promise.all([...entries.values()].map((entry) => stopEntry(entry)))
    },
  } satisfies McpRegistry

  function assertOpen(): void {
    if (closed) throw new McpError("runtime_closed", "MCP Registry 已关闭")
  }

  function requireEntry(serverID: string): McpEntry {
    const entry = entries.get(serverID)
    if (!entry) throw new McpError("server_not_found", `MCP Server 不存在: ${serverID}`)
    return entry
  }

  function requireConnection(serverID: string): McpConnection {
    const entry = requireEntry(serverID)
    if (!entry.connection) throw new McpError("server_not_connected", `MCP Server 尚未连接: ${serverID}`)
    return entry.connection
  }

  function publish(server: McpServer): void {
    listeners.forEach((listener) => listener(server))
  }

  function publishToolsChanged(serverID: string): void {
    catalogListeners.forEach((listener) => listener(serverID))
  }

  function watchConnection(entry: McpEntry, connection: McpConnection, generation: number): () => void {
    const cleanups = [
      connection.onToolsChanged?.(() => {
        if (entry.generation === generation && entry.connection === connection) publishToolsChanged(entry.config.id)
      }),
      connection.onClose?.(() => {
        if (entry.generation !== generation || entry.connection !== connection || closed) return
        entry.cleanup?.()
        entry.cleanup = undefined
        entry.connection = undefined
        entry.server = {
          ...snapshot(entry.config, "failed"),
          error: { code: "connection_failed", message: "MCP 连接已关闭，等待恢复" },
        }
        publish(entry.server)
        scheduleReconnect(entry)
      }),
    ].filter((cleanup): cleanup is () => void => cleanup !== undefined)
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  function scheduleReconnect(entry: McpEntry): void {
    if (closed || entry.config.disabled || entry.retryTimer || entry.reconnectAttempts >= 3) return
    const generation = entry.generation
    entry.reconnectAttempts += 1
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = undefined
      if (closed || entry.generation !== generation || entry.connection || entry.operation) return
      void registry.connect(entry.config.id).then((server) => {
        if (server.status === "failed") scheduleReconnect(entry)
      })
    }, 250)
  }

  async function stopEntry(entry: McpEntry): Promise<void> {
    entry.generation += 1
    if (entry.retryTimer) clearTimeout(entry.retryTimer)
    entry.retryTimer = undefined
    entry.cleanup?.()
    entry.cleanup = undefined
    entry.operation?.controller.abort()
    entry.operation = undefined
    const connection = entry.connection
    entry.connection = undefined
    entry.server = snapshot(entry.config, "disabled")
    publish(entry.server)
    if (connection) await closeQuietly(connection)
  }

  return registry
}

export function validateMcpServerConfig(config: McpServerConfig): void {
  normalizeMcpServerConfig(config)
}

export function normalizeMcpServerConfig(config: McpServerConfig): McpServerConfig {
  if (!config.id.trim() || !config.name.trim()) throw new McpError("invalid_config", "MCP Server id/name 不能为空")
  const url = parseMcpUrl(config.url)
  const headers = config.headers ? { ...config.headers } : undefined
  if (Object.keys(headers ?? {}).some((name) => /authorization|cookie|token|secret|password|api[-_]?key/i.test(name))) {
    throw new McpError("invalid_config", "MCP 配置不得持久化凭据 header")
  }
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0)) {
    throw new McpError("invalid_config", "MCP Server timeout 必须是正整数")
  }
  return {
    ...config,
    id: config.id.trim(),
    name: config.name.trim(),
    url: url.toString(),
    ...(headers ? { headers } : {}),
  }
}

function parseMcpUrl(value: string): URL {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
    if (url.username || url.password) throw new Error()
    return url
  } catch {
    throw new McpError("invalid_config", "MCP Server URL 必须是合法的 HTTP(S) 地址")
  }
}

function snapshot(config: McpServerConfig, status: McpServerStatus): McpServer {
  return { id: config.id, name: config.name, url: config.url, status }
}

function summarizeMcpError(error: unknown): McpErrorSummary {
  const code = error instanceof McpError ? error.code : "connection_failed"
  const message = error instanceof Error ? error.message : "MCP 连接失败"
  return { code, message: safeMcpErrorMessage(message) }
}

function safeMcpErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/(token|secret|client_secret|code)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 256)
}

function closeQuietly(connection: McpConnection): Promise<void> {
  return connection.close().catch(() => {})
}

function isRecoverableConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ""
  return /401|unauthorized|session\s+(expired|invalid|closed)/i.test(message)
}
