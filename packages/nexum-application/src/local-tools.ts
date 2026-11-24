/**
 * Nexum Core 的最小工具注册、资源归一化和执行适配。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
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

/** POC 首期内置工具名称。 */
export type NexumBuiltinToolName = "read" | "write" | "edit" | "shell" | "skill_registry"

/** Nexum 工具注册配置。 */
export interface NexumToolRegistryOptions {
  readonly sessions: NexumSessionService
  readonly host?: HostPort
  readonly skillRegistry?: NexumSkillRegistry
  readonly mcp?: McpPort
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
  let refreshPromise: Promise<void> | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
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
          return options.host
            ? options.host.readText({ directory: session.directory, path: request.input.path })
            : readTool(session.directory, request)
        }
        if (request.toolName === "write" || request.toolName === "edit") {
          return options.host
            ? options.host.writeText({ directory: session.directory, path: request.input.path, content: request.input.content })
            : writeTool(session.directory, request)
        }
        if (request.toolName === "shell") {
          return options.host
            ? options.host.runShell({ directory: session.directory, command: request.input.command, signal: request.signal })
            : shellTool(session.directory, request)
        }
        if (request.toolName === "skill_registry") {
          return options.skillRegistry
            ? executeSkillRegistryTool(options.skillRegistry, request)
            : { ok: false, output: "Skill 注册表未配置" }
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
        names.splice(builtinDefinitions.length, names.length - builtinDefinitions.length, ...loaded.names)
        mcpBindings.clear()
        loaded.bindings.forEach((binding, name) => mcpBindings.set(name, binding))
      })
      .finally(() => {
        refreshPromise = undefined
      })
    return refreshPromise
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
  description: "管理 Nexum 注册表中的 Skill。必须使用 address 注册；禁止用 shell 搜索 Skill，也不能删除或修改 Skill 源文件。",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["list", "detail", "register", "refresh", "validate", "unregister"],
        description: "要执行的注册表操作",
      },
      id: { type: "string", description: "Skill ID；detail、refresh、unregister 时使用" },
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
    operation !== "unregister"
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
    await registry.unregister(request.input.id)
    return safeSkillRegistryResult({ id: request.input.id, deleted: true })
  } catch {
    return { ok: false, output: "Skill 注册表操作失败" }
  }
}

function safeSkillRegistryResult(value: unknown): ToolResult {
  return { ok: true, output: JSON.stringify(value) }
}

async function readTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  const path = resourcePath(directory, request.input.path)
  if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
  if (typeof request.input.path !== "string") return { ok: false, output: "read 工具缺少 path" }
  try {
    return { ok: true, output: await readFile(path, "utf8") }
  } catch {
    return { ok: false, output: "read 工具执行失败" }
  }
}

async function writeTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  const path = resourcePath(directory, request.input.path)
  if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
  if (typeof request.input.path !== "string") return { ok: false, output: "write 工具缺少 path" }
  if (typeof request.input.content !== "string") return { ok: false, output: "write 工具缺少 content" }
  try {
    await mkdir(resolve(path, ".."), { recursive: true })
    await writeFile(path, request.input.content, "utf8")
    return { ok: true, output: "" }
  } catch {
    return { ok: false, output: "write 工具执行失败" }
  }
}

async function shellTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  if (typeof request.input.command !== "string" || !request.input.command.trim()) {
    return { ok: false, output: "shell 工具缺少 command" }
  }
  try {
    const child = Bun.spawn(["sh", "-lc", request.input.command], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    const exitCode = await child.exited
    return { ok: exitCode === 0, output: `${stdout}${stderr}`.trim() }
  } catch {
    return { ok: false, output: "shell 工具执行失败" }
  }
}

function resourcePath(directory: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const candidate = resolve(directory, value)
  const relativePath = relative(directory, candidate)
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return undefined
  return candidate
}
