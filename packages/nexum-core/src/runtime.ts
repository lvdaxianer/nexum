/**
 * Nexum Runtime 的生命周期与能力发现契约。
 */

import type { EventSink, NexumCodingLoop, NexumSessionService, NexumCodingLoopInput, SessionRecord } from "./index.js"
import type { HostPort } from "./host.js"
import type { McpPort } from "./mcp.js"
import type { MemoryPort } from "./memory.js"

export type NexumRuntimeStatus = "ready" | "closed"
export type NexumCapabilityStatus = "enabled" | "disabled"

export interface NexumCapability {
  readonly id: string
  readonly version: string
  readonly status: NexumCapabilityStatus
  readonly operations: readonly string[]
}

export interface NexumRuntimeOptions {
  readonly sessions: NexumSessionService
  readonly loop: NexumCodingLoop
  readonly events: EventSink
  readonly capabilities?: readonly NexumCapability[]
  readonly memory?: MemoryPort
  readonly mcp?: McpPort
  readonly host?: HostPort
}

export class NexumRuntimeError extends Error {
  constructor(readonly code: "runtime_closed", message = "Nexum Runtime 已关闭") {
    super(message)
    this.name = "NexumRuntimeError"
  }
}

export interface NexumRuntime {
  readonly status: () => NexumRuntimeStatus
  readonly capabilities: () => readonly NexumCapability[]
  readonly sessions: NexumSessionService
  readonly events: EventSink
  readonly memory?: MemoryPort
  readonly mcp?: McpPort
  readonly host?: HostPort
  readonly prompt: (input: NexumCodingLoopInput) => Promise<SessionRecord>
  readonly cancel: (sessionID: string) => Promise<SessionRecord>
  readonly close: () => Promise<void>
}

export function createNexumRuntime(options: NexumRuntimeOptions): NexumRuntime {
  let status: NexumRuntimeStatus = "ready"
  const capabilities = options.capabilities ?? defaultCapabilities(options)
  const ensureReady = (): void => {
    if (status === "closed") throw new NexumRuntimeError("runtime_closed")
  }

  return {
    status: () => status,
    capabilities: () => capabilities,
    sessions: options.sessions,
    events: options.events,
    ...(options.memory ? { memory: options.memory } : {}),
    ...(options.mcp ? { mcp: options.mcp } : {}),
    ...(options.host ? { host: options.host } : {}),
    prompt: async (input) => {
      ensureReady()
      return options.loop.run(input)
    },
    cancel: async (sessionID) => {
      ensureReady()
      return options.loop.cancel(sessionID)
    },
    close: async () => {
      if (status === "closed") return
      status = "closed"
      await options.mcp?.close?.()
    },
  }
}

function defaultCapabilities(options: NexumRuntimeOptions): readonly NexumCapability[] {
  return [
    capability("model", ["prompt"]),
    capability("tool", ["execute"]),
    capability("permission", ["evaluate"]),
    capability("interaction", ["request", "reply"]),
    capability("session", ["create", "list", "get", "update", "delete"]),
    capability("context", ["load", "compact"]),
    capability("skill", ["list", "activate"]),
    capability("memory", ["search", "upsert", "remove"], options.memory !== undefined),
    capability("mcp", ["listServers", "listTools", "listResources", "listPrompts", "callTool"], options.mcp !== undefined),
    capability("host", ["readText", "writeText", "runShell"], options.host !== undefined),
    capability("event", ["publish"]),
  ]
}

function capability(id: string, operations: readonly string[], enabled = true): NexumCapability {
  return { id, version: "1", status: enabled ? "enabled" : "disabled", operations }
}
