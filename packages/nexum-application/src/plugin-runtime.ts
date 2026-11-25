/**
 * Application 层 Plugin 的 Session 作用域、挂载和卸载生命周期。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */

import {
  NexumPluginInvocationError,
  type NexumPluginActivationInput,
  type NexumPluginActivationPort,
  type NexumPluginActivationResult,
  type PermissionPort,
  type ToolRequest,
  type ToolResult,
} from "@nexum/core"
import type { NexumApplicationPluginRegistry, NexumApplicationPluginPackage } from "./plugin-registry.ts"
import {
  createNexumPluginActiveTools,
  normalizeNexumPluginMount,
  type NexumPluginActiveTool,
  type NexumPluginEntrypoint,
  type NexumPluginMount,
} from "./plugin-mount.ts"
export type {
  NexumPluginEntrypoint,
  NexumPluginMount,
  NexumPluginMountContext,
  NexumPluginTool,
} from "./plugin-mount.ts"
export { normalizeNexumPluginMount } from "./plugin-mount.ts"

/** 当前 Session 已挂载的 Plugin 快照。 */
export interface NexumActivePlugin {
  readonly sessionID: string
  readonly pluginID: string
  readonly capabilities: readonly string[]
}

/** Plugin 作用域诊断的稳定错误码。 */
export type NexumPluginRuntimeDiagnosticCode = "plugin_mount_failed" | "plugin_unmount_failed"

/** Plugin 作用域诊断。 */
export interface NexumPluginRuntimeDiagnostic {
  readonly code: NexumPluginRuntimeDiagnosticCode
  readonly pluginID: string
  readonly sessionID: string
}

/** Plugin 作用域生命周期错误。 */
export class NexumPluginRuntimeError extends Error {
  /**
   * 创建 Plugin 作用域错误。
   *
   * @param code - 稳定错误码
   * @param message - 面向日志或 UI 的错误消息
   * @param pluginID - 目标 Plugin ID
   * @param sessionID - 目标 Session ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-25
   */
  constructor(
    readonly code: NexumPluginRuntimeDiagnosticCode,
    message: string,
    readonly pluginID: string,
    readonly sessionID: string,
  ) {
    super(message)
    this.name = "NexumPluginRuntimeError"
  }
}

/** Plugin 作用域运行时配置。 */
export interface NexumPluginRuntimeOptions {
  readonly registry: NexumApplicationPluginRegistry
  readonly permission?: PermissionPort
}

/** Plugin 作用域运行时端口。 */
export interface NexumPluginRuntime extends NexumPluginActivationPort {
  readonly deactivate: (input: { readonly sessionID: string; readonly pluginID: string }) => Promise<void>
  readonly listActive: (sessionID: string) => Promise<readonly NexumActivePlugin[]>
  readonly listTools: (sessionID: string) => Promise<readonly NexumPluginActiveTool["definition"][]>
  readonly executeTool: (request: ToolRequest) => Promise<ToolResult | undefined>
  readonly listDiagnostics: () => Promise<readonly NexumPluginRuntimeDiagnostic[]>
  readonly close: () => Promise<void>
}

interface ActivePlugin extends NexumActivePlugin {
  readonly mount: NexumPluginMount
  readonly tools: readonly NexumPluginActiveTool[]
}

/**
 * 创建按 Session 隔离的 Plugin 作用域运行时。
 *
 * 只有挂载成功后才写入 active scope；卸载先从作用域移除，再执行 Plugin 自己的清理函数。
 * @param options - Plugin Registry
 * @returns 可被显式和自然路由共同调用的激活端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createNexumPluginRuntime(options: NexumPluginRuntimeOptions): NexumPluginRuntime {
  const scopes = new Map<string, Map<string, ActivePlugin>>()
  const diagnostics: NexumPluginRuntimeDiagnostic[] = []

  return {
    activate,
    deactivate,
    listActive: async (sessionID) => [...(scopes.get(sessionID)?.values() ?? [])].map(copyActivePlugin),
    listTools: async (sessionID) => [...(scopes.get(sessionID)?.values() ?? [])]
      .flatMap((plugin) => plugin.tools.map((tool) => tool.definition)),
    executeTool: async (request) => executePluginTool(request),
    listDiagnostics: async () => diagnostics.map((item) => ({ ...item })),
    close: async () => closeScopes(),
  }

  async function activate(input: NexumPluginActivationInput): Promise<NexumPluginActivationResult> {
    const current = scopes.get(input.sessionID)?.get(input.pluginID)
    if (current) return { pluginID: input.pluginID, status: "active", source: input.source }
    const plugin = await options.registry.get(input.pluginID)
    const available = assertPluginAvailable(plugin, input)
    await requestPluginPermission(options.permission, input)
    const mount = await mountPlugin(available, input)
    const sessionScope = scopes.get(input.sessionID) ?? new Map<string, ActivePlugin>()
    sessionScope.set(input.pluginID, {
      sessionID: input.sessionID,
      pluginID: input.pluginID,
      capabilities: [...mount.capabilities],
      mount,
      tools: createNexumPluginActiveTools(input.pluginID, mount.tools ?? []),
    })
    scopes.set(input.sessionID, sessionScope)
    return { pluginID: input.pluginID, status: "active", source: input.source }
  }

  async function deactivate(input: { readonly sessionID: string; readonly pluginID: string }): Promise<void> {
    const sessionScope = scopes.get(input.sessionID)
    const active = sessionScope?.get(input.pluginID)
    if (!sessionScope || !active) return
    sessionScope.delete(input.pluginID)
    if (sessionScope.size === 0) scopes.delete(input.sessionID)
    try {
      await active.mount.unmount()
    } catch {
      diagnostics.push({ code: "plugin_unmount_failed", pluginID: input.pluginID, sessionID: input.sessionID })
      throw new NexumPluginRuntimeError(
        "plugin_unmount_failed",
        `Plugin 卸载失败: ${input.pluginID}`,
        input.pluginID,
        input.sessionID,
      )
    }
  }

  async function closeScopes(): Promise<void> {
    const active = [...scopes.values()].flatMap((scope) => [...scope.values()])
    await Promise.all(active.map((plugin) => deactivate(plugin)))
  }

  async function executePluginTool(request: ToolRequest): Promise<ToolResult | undefined> {
    const tools = [...(scopes.get(request.sessionID)?.values() ?? [])].flatMap((plugin) => plugin.tools)
    const tool = tools.find((item) => item.name === request.toolName)
    return tool ? tool.execute(request) : undefined
  }

  async function mountPlugin(
    plugin: NexumApplicationPluginPackage,
    input: NexumPluginActivationInput,
  ): Promise<NexumPluginMount> {
    try {
      const entry = requireEntrypoint(await plugin.load(), input)
      const mount = await entry.mount({
        sessionID: input.sessionID,
        pluginID: input.pluginID,
        source: input.source,
      })
      return normalizeNexumPluginMount(mount)
    } catch (error) {
      if (error instanceof NexumPluginRuntimeError) throw error
      diagnostics.push({ code: "plugin_mount_failed", pluginID: input.pluginID, sessionID: input.sessionID })
      throw new NexumPluginRuntimeError(
        "plugin_mount_failed",
        `Plugin 挂载失败: ${input.pluginID}`,
        input.pluginID,
        input.sessionID,
      )
    }
  }
}

/**
 * 校验 Plugin 在 Registry 中仍可被激活。
 *
 * @param plugin - Registry 返回的包
 * @param input - 激活请求
 * @returns 无返回值；失败时抛出稳定调用错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function assertPluginAvailable(
  plugin: NexumApplicationPluginPackage | undefined,
  input: NexumPluginActivationInput,
): NexumApplicationPluginPackage {
  if (!plugin) {
    throw new NexumPluginInvocationError("plugin_not_found", `Plugin 不存在: ${input.pluginID}`, input.pluginID)
  }
  if (plugin.summary.status !== "registered") {
    throw new NexumPluginInvocationError("plugin_not_ready", `Plugin 不可激活: ${input.pluginID}`, input.pluginID)
  }
  return plugin
}

/**
 * 在动态入口执行前请求 Plugin 激活权限。
 *
 * @param permission - 可选宿主权限端口
 * @param input - 激活请求
 * @returns 权限允许后的完成 Promise
 * @throws {NexumPluginInvocationError} 权限拒绝或需要审批时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function requestPluginPermission(
  permission: PermissionPort | undefined,
  input: NexumPluginActivationInput,
): Promise<void> {
  if (!permission) return
  const effect = await permission.evaluate({
    sessionID: input.sessionID,
    toolName: "plugin.activate",
    action: "plugin.activate",
    resource: input.pluginID,
    input: { pluginID: input.pluginID },
  })
  if (effect !== "allow") {
    throw new NexumPluginInvocationError("plugin_permission_denied", `Plugin 权限被拒绝: ${input.pluginID}`, input.pluginID)
  }
}

/**
 * 从动态模块中读取并校验默认 Plugin 入口。
 *
 * @param module - 动态导入得到的未知模块
 * @param input - 激活请求
 * @returns 经过边界校验的入口
 * @throws {NexumPluginRuntimeError} 模块没有合法 mount 函数时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function requireEntrypoint(module: unknown, input: NexumPluginActivationInput): NexumPluginEntrypoint {
  const entry = isRecord(module) && isRecord(module.default) ? module.default : undefined
  const mount = entry?.mount
  if (typeof mount !== "function") {
    throw new NexumPluginRuntimeError(
      "plugin_mount_failed",
      `Plugin 缺少 mount: ${input.pluginID}`,
      input.pluginID,
      input.sessionID,
    )
  }
  return { mount: mount as unknown as NexumPluginEntrypoint["mount"] }
}

/**
 * 复制 active Plugin 快照，不返回宿主持有的卸载闭包。
 *
 * @param plugin - 内部 active Plugin
 * @returns 对外安全快照
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function copyActivePlugin(plugin: ActivePlugin): NexumActivePlugin {
  return { sessionID: plugin.sessionID, pluginID: plugin.pluginID, capabilities: [...plugin.capabilities] }
}

/**
 * 判断值是否为对象记录。
 *
 * @param input - 未知输入
 * @returns 是否为对象记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}
