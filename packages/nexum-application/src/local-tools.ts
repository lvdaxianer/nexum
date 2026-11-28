/**
 * Nexum Core 的最小工具注册、资源归一化和执行适配。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type {
  HostPort,
  McpPort,
  ModelToolDefinition,
  NexumSessionService,
  NexumSkillRegistry,
  ToolPort,
  ToolRequest,
  ToolResult,
} from "@nexum/core"
import { NexumSkillRegistryError } from "@nexum/core"
import { createLocalHostAdapter, createSandboxHost, type NexumSandboxOptions } from "@nexum/integrations"
import type { NexumLocalFunctionRegistry } from "./local-functions.ts"

/** POC 首期内置工具名称。 */
export type NexumBuiltinToolName = "read" | "write" | "edit" | "shell" | "skill_registry"

/** Nexum 工具注册配置。 */
export interface NexumToolRegistryOptions {
  readonly sessions: NexumSessionService
  readonly host?: HostPort
  readonly sandbox?: NexumSandboxOptions
  readonly shellTimeoutMs?: number
  readonly shellCleanupTimeoutMs?: number
  readonly skillRegistry?: NexumSkillRegistry
  readonly mcp?: McpPort
  readonly localFunctions?: NexumLocalFunctionRegistry
}

/** 内置工具注册表和统一执行端口。 */
export interface NexumToolRegistry {
  readonly names: readonly string[]
  readonly definitions: readonly ModelToolDefinition[]
  readonly port: ToolPort
  readonly ready: Promise<void>
  readonly refresh: () => Promise<void>
}

/**
 * 将模型工具调用归一化为权限系统使用的 action/resource。
 *
 * @param sessionID - 目标 Session ID
 * @param toolName - 模型返回的工具名称
 * @param input - 模型返回的工具参数
 * @returns 带规范化权限字段的工具请求
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function normalizeNexumToolRequest(
  sessionID: string,
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): ToolRequest {
  const action = toolName === "read" ? "read" : toolName === "write" || toolName === "edit" ? "write" : toolName
  const resource =
    toolName === "shell"
      ? typeof input.command === "string"
        ? input.command
        : "shell"
      : typeof input.path === "string"
        ? input.path
        : toolName
  return { sessionID, toolName, action, resource, input, ...(signal ? { signal } : {}) }
}

/**
 * 创建只依赖 Session Service 的最小内置工具注册表。
 *
 * @param options - Session 查询端口
 * @returns read、write/edit 和 shell 工具的统一执行端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createNexumToolRegistry(options: NexumToolRegistryOptions): NexumToolRegistry {
  const localHost = options.host ?? createLocalHostAdapter({ timeoutMs: options.shellTimeoutMs, cleanupTimeoutMs: options.shellCleanupTimeoutMs })
  const host = options.sandbox ? createSandboxHost(localHost, options.sandbox) : localHost
  const names: string[] = [
    "read",
    "write",
    "edit",
    "shell",
    ...(options.skillRegistry ? ["skill_registry" as const] : []),
  ]
  const builtinDefinitions: readonly ModelToolDefinition[] = [
    {
      name: "read",
      description: "读取 Session 工作目录内的文本文件",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "相对于工作目录的文件路径" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
    {
      name: "write",
      description: "写入 Session 工作目录内的文本文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于工作目录的文件路径" },
          content: { type: "string", description: "要写入的文本" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "edit",
      description: "覆盖写入 Session 工作目录内的文本文件",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "相对于工作目录的文件路径" },
          content: { type: "string", description: "更新后的文本" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    {
      name: "shell",
      description: "在 Session 工作目录内执行受权限保护的 shell 命令",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "要执行的 shell 命令" } },
        required: ["command"],
        additionalProperties: false,
      },
    },
    ...(options.skillRegistry ? [skillRegistryDefinition] : []),
  ]
  const definitions: ModelToolDefinition[] = [...builtinDefinitions]
  const mcpBindings = new Map<string, { serverID: string; toolName: string }>()
  let mcpDefinitions: readonly ModelToolDefinition[] = []
  const localFunctionDefinitions = options.localFunctions?.definitions ?? []
  let refreshPromise: Promise<void> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  options.localFunctions?.subscribe(refreshCatalog)
  refreshCatalog()
  const ready = options.mcp ? refreshMcpTools() : Promise.resolve()
  options.mcp?.subscribeToolsChanged?.(() => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      void refreshMcpTools().catch(() => {})
    }, 50)
  })

  return {
    names,
    definitions,
    port: {
      execute: async (request) => {
        const session = await options.sessions.get(request.sessionID)
        if (!session) return { ok: false, output: "Session 不存在" }
        if (request.toolName === "read") {
          return host.readText({ directory: session.directory, path: request.input.path })
        }
        if (request.toolName === "write" || request.toolName === "edit") {
          return host.writeText({ directory: session.directory, path: request.input.path, content: request.input.content })
        }
        if (request.toolName === "shell") {
          return host.runShell({ directory: session.directory, command: request.input.command, signal: request.signal })
        }
        if (request.toolName === "skill_registry") {
          return options.skillRegistry
            ? executeSkillRegistryTool(options.skillRegistry, request)
            : { ok: false, output: "Skill 注册表未配置" }
        }
        if (options.localFunctions?.names.includes(request.toolName)) {
          return options.localFunctions.execute(request)
        }
        const binding = mcpBindings.get(request.toolName)
        if (binding && options.mcp) {
          return options.mcp.callTool({
            serverID: binding.serverID,
            toolName: binding.toolName,
            input: request.input,
            sessionID: request.sessionID,
            ...(request.signal ? { signal: request.signal } : {}),
          })
        }
        return { ok: false, output: "工具未注册" }
      },
    },
    ready,
    refresh: refreshMcpTools,
  }

  async function refreshMcpTools(): Promise<void> {
    if (!options.mcp) return
    if (refreshPromise) return refreshPromise
    refreshPromise = loadMcpTools(options.mcp)
      .then((loaded) => {
        definitions.splice(builtinDefinitions.length, definitions.length - builtinDefinitions.length, ...loaded.definitions)
        mcpDefinitions = loaded.definitions
        mcpBindings.clear()
        loaded.bindings.forEach((binding, name) => mcpBindings.set(name, binding))
        refreshCatalog()
      })
      .finally(() => {
        refreshPromise = undefined
      })
    return refreshPromise
  }

  function refreshCatalog(): void {
    const additions = [...localFunctionDefinitions, ...mcpDefinitions]
    definitions.splice(builtinDefinitions.length, definitions.length - builtinDefinitions.length, ...additions)
    names.splice(builtinDefinitions.length, names.length - builtinDefinitions.length, ...additions.map((definition) => definition.name))
  }
}

async function loadMcpTools(mcp: McpPort): Promise<{
  readonly definitions: readonly ModelToolDefinition[]
  readonly names: readonly string[]
  readonly bindings: ReadonlyMap<string, { serverID: string; toolName: string }>
}> {
  const servers = (await mcp.listServers()).filter((server) => server.status === "connected" || server.status === "available")
  const groups = await Promise.all(servers.map(async (server) => ({ server, tools: await mcp.listTools(server.id) })))
  const bindings = new Map<string, { serverID: string; toolName: string }>()
  const definitions = groups.flatMap(({ server, tools }) =>
    tools.map((tool) => {
      const name = `mcp__${mcpNamespace(server.id, server.name)}__${mcpToolName(tool.name)}`
      bindings.set(name, { serverID: server.id, toolName: tool.name })
      return {
        name,
        description: tool.description ?? `调用 ${server.name} 的 MCP 工具 ${tool.name}`,
        parameters: tool.inputSchema ?? { type: "object" },
      }
    }),
  )
  return { definitions, names: definitions.map((definition) => definition.name), bindings }
}

function mcpNamespace(serverID: string, serverName: string): string {
  const value = (serverName.trim() || serverID).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  return value || serverID
}

function mcpToolName(toolName: string): string {
  const value = toolName.trim().replace(/[^a-zA-Z0-9_-]+/g, "_")
  return value || "tool"
}

const skillRegistryDefinition: ModelToolDefinition = {
  name: "skill_registry",
  description: "管理 Nexum 注册表中的 Skill。必须使用 address 注册；禁止用 shell 搜索 Skill；remove 只允许删除配置 root 下的内置 Skill 源目录。",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["list", "detail", "register", "refresh", "validate", "unregister", "remove"],
        description: "要执行的注册表操作",
      },
      id: { type: "string", description: "Skill ID；detail、refresh、validate、unregister、remove 时使用" },
      address: { type: "string", description: "本地 Skill 目录地址；register 时必填" },
    },
    required: ["operation"],
    additionalProperties: false,
  },
}

async function executeSkillRegistryTool(registry: NexumSkillRegistry, request: ToolRequest): Promise<ToolResult> {
  const operation = request.input.operation
  if (
    operation !== "list" &&
    operation !== "detail" &&
    operation !== "register" &&
    operation !== "refresh" &&
    operation !== "validate" &&
    operation !== "unregister" &&
    operation !== "remove"
  ) {
    return { ok: false, output: "skill_registry 工具参数无效" }
  }
  try {
    if (operation === "list") return safeSkillRegistryResult(await registry.list())
    if (operation === "detail") {
      if (typeof request.input.id !== "string" || !request.input.id.trim()) return { ok: false, output: "skill_registry 工具参数无效" }
      const summary = (await registry.list()).find((item) => item.id === request.input.id)
      return summary ? safeSkillRegistryResult(summary) : { ok: false, output: "Skill 不存在" }
    }
    if (operation === "register") {
      if (typeof request.input.address !== "string" || !request.input.address.trim()) return { ok: false, output: "skill_registry 工具参数无效" }
      return safeSkillRegistryResult(await registry.register(request.input.address))
    }
    if (operation === "refresh") {
      if (request.input.id !== undefined && typeof request.input.id !== "string") return { ok: false, output: "skill_registry 工具参数无效" }
      await registry.refresh(typeof request.input.id === "string" ? request.input.id : undefined)
      return safeSkillRegistryResult(await registry.list())
    }
    if (operation === "validate") {
      if (request.input.id !== undefined && typeof request.input.id !== "string") return { ok: false, output: "skill_registry 工具参数无效" }
      await registry.refresh(typeof request.input.id === "string" ? request.input.id : undefined)
      const summaries = await registry.list()
      const data = typeof request.input.id === "string" ? summaries.filter((item) => item.id === request.input.id) : summaries
      return safeSkillRegistryResult({ valid: data.length > 0 && data.every((item) => item.status === "ready"), data })
    }
    if (typeof request.input.id !== "string" || !request.input.id.trim()) return { ok: false, output: "skill_registry 工具参数无效" }
    if (operation === "unregister") {
      await registry.unregister(request.input.id)
      return safeSkillRegistryResult({ id: request.input.id, deleted: true })
    }
    await registry.remove(request.input.id)
    return safeSkillRegistryResult({ id: request.input.id, deleted: true, sourceDeleted: true })
  } catch (error) {
    if (error instanceof NexumSkillRegistryError) return { ok: false, output: skillRegistryErrorOutput(error) }
    return { ok: false, output: "Skill 注册表操作失败" }
  }
}

/**
 * 将 Registry 内部错误映射为各控制面共用的稳定错误码和操作提示。
 *
 * @param error - Registry 生命周期错误
 * @returns Agent 可安全展示的错误文本
 * @author lvdaxianer@yeah.net
 * @date 2026-11-28
 */
function skillRegistryErrorOutput(error: NexumSkillRegistryError): string {
  const details = {
    builtin: ["NEXUM_SKILL_BUILTIN", "内置 Skill 不能取消注册，请使用 remove"],
    source_not_removable: ["NEXUM_SKILL_SOURCE_NOT_REMOVABLE", "只有内置 Skill 支持删除源目录"],
    source_remove_failed: ["NEXUM_SKILL_SOURCE_DELETE_FAILED", "源目录删除失败，注册记录已保留"],
    persistence_failed: ["NEXUM_SKILL_REGISTRY_STORAGE_FAILED", "注册状态保存失败，源目录未改动"],
  }[error.code]
  return `Skill 注册表操作失败：${details[0]}，${details[1]}`
}

function safeSkillRegistryResult(value: unknown): ToolResult {
  return { ok: true, output: JSON.stringify(value) }
}
