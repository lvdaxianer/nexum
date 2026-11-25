/**
 * Plugin 挂载结果与 Session 工具绑定的边界校验。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */

import type { ModelToolDefinition, ToolPort } from "@nexum/core"

/** Plugin 入口收到的 Session 作用域上下文。 */
export interface NexumPluginMountContext {
  readonly sessionID: string
  readonly pluginID: string
  readonly source: "explicit" | "automatic"
}

/** Plugin Function 对宿主暴露的模型定义和执行端口。 */
export interface NexumPluginTool {
  readonly definition: ModelToolDefinition
  readonly execute: ToolPort["execute"]
}

/** Plugin 入口成功挂载后交给宿主的能力和卸载函数。 */
export interface NexumPluginMount {
  readonly capabilities: readonly string[]
  readonly tools?: readonly NexumPluginTool[]
  readonly unmount: () => Promise<void>
}

/** Plugin 入口模块的最小实现约定。 */
export interface NexumPluginEntrypoint {
  readonly mount: (context: NexumPluginMountContext) => Promise<NexumPluginMount>
}

/** active scope 内带宿主命名空间的工具绑定。 */
export interface NexumPluginActiveTool {
  readonly name: string
  readonly definition: ModelToolDefinition
  readonly execute: ToolPort["execute"]
}

/**
 * 校验入口返回的挂载句柄，避免不完整能力进入 active scope。
 *
 * @param mount - Plugin 入口返回的未知挂载值
 * @returns 经过校验的挂载句柄
 * @throws {Error} 挂载值或工具定义无效时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function normalizeNexumPluginMount(mount: unknown): NexumPluginMount {
  if (!isRecord(mount) || !isStringArray(mount.capabilities) || typeof mount.unmount !== "function") {
    throw new Error("Plugin 挂载结果无效")
  }
  const unmount = mount.unmount as unknown as () => Promise<unknown>
  return {
    capabilities: [...mount.capabilities],
    tools: normalizeTools(mount.tools),
    unmount: async () => void (await unmount()),
  }
}

/**
 * 为 Plugin 工具生成不会与宿主工具冲突的名字并复制定义。
 *
 * @param pluginID - Plugin ID
 * @param tools - Plugin 工具
 * @returns 带命名空间的工具绑定
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createNexumPluginActiveTools(
  pluginID: string,
  tools: readonly NexumPluginTool[],
): readonly NexumPluginActiveTool[] {
  return tools.map((tool) => {
    const normalized = tool.definition.name.trim().replace(/[^a-zA-Z0-9_-]+/g, "_") || "tool"
    const name = `plugin__${pluginID}__${normalized}`
    return { name, definition: { ...tool.definition, name }, execute: tool.execute }
  })
}

/**
 * 校验 Plugin 挂载返回的工具集合。
 *
 * @param tools - 未知工具集合
 * @returns 经过校验的 Plugin 工具
 * @throws {Error} 工具定义或执行函数无效时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function normalizeTools(tools: unknown): readonly NexumPluginTool[] {
  if (tools === undefined) return []
  if (!Array.isArray(tools)) throw new Error("Plugin 工具集合无效")
  return tools.map((tool) => normalizeTool(tool))
}

/**
 * 校验单个 Plugin 工具，并保留宿主 ToolPort 形状。
 *
 * @param tool - 未知工具
 * @returns 经过校验的 Plugin 工具
 * @throws {Error} 工具字段无效时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function normalizeTool(tool: unknown): NexumPluginTool {
  if (
    !isRecord(tool) ||
    !isRecord(tool.definition) ||
    !isModelToolDefinition(tool.definition) ||
    typeof tool.execute !== "function"
  ) {
    throw new Error("Plugin 工具定义无效")
  }
  return {
    definition: tool.definition as unknown as ModelToolDefinition,
    execute: tool.execute as unknown as ToolPort["execute"],
  }
}

/**
 * 判断值是否为模型工具定义。
 *
 * @param input - 未知工具定义
 * @returns 是否具备模型工具必填字段
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isModelToolDefinition(input: Record<string, unknown>): boolean {
  return typeof input.name === "string" && input.name.trim().length > 0 &&
    typeof input.description === "string" && isRecord(input.parameters)
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

/**
 * 判断值是否为字符串数组。
 *
 * @param input - 未知输入
 * @returns 是否为只包含字符串的数组
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isStringArray(input: unknown): input is readonly string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string")
}
