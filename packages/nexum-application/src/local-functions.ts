/** Nexum 进程内本地 JS 函数的注册、发现和执行适配。 */

import type {
  ModelToolDefinition,
  NexumLocalFunction,
  NexumLocalFunctionProvider,
  ToolPort,
  ToolRequest,
  ToolResult,
} from "@nexum/core"

/** 进程内本地函数注册表。 */
export interface NexumLocalFunctionRegistry {
  readonly names: readonly string[]
  readonly definitions: readonly ModelToolDefinition[]
  readonly register: (provider: NexumLocalFunctionProvider) => void
  readonly unregister: (providerID: string) => void
  readonly execute: ToolPort["execute"]
  readonly subscribe: (listener: () => void) => () => void
}

interface LocalFunctionBinding {
  readonly providerID: string
  readonly toolName: string
  readonly definition: ModelToolDefinition
  readonly function: NexumLocalFunction
}

/**
 * 创建进程内本地 JS 函数注册表。
 *
 * @param initialProviders - Runtime 创建时注入的本地函数 provider
 * @returns 可被统一 Tool Registry 使用的本地函数端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
export function createNexumLocalFunctionRegistry(
  initialProviders: readonly NexumLocalFunctionProvider[] = [],
): NexumLocalFunctionRegistry {
  const bindings = new Map<string, LocalFunctionBinding>()
  const names: string[] = []
  const definitions: ModelToolDefinition[] = []
  const listeners = new Set<() => void>()
  initialProviders.forEach(registerProvider)

  return {
    names,
    definitions,
    register: registerProvider,
    unregister: unregisterProvider,
    execute: executeFunction,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  function registerProvider(provider: NexumLocalFunctionProvider): void {
    validateProvider(provider)
    const additions = provider.functions.map((localFunction) => createBinding(provider, localFunction))
    const next = new Map(bindings)
    additions.forEach((binding) => {
      const existing = next.get(binding.toolName)
      if (existing && !sameDefinition(existing.definition, binding.definition)) throw new Error("本地函数定义冲突")
      next.set(binding.toolName, binding)
    })
    next.forEach((binding, toolName) => bindings.set(toolName, binding))
    refreshCatalog()
  }

  function createBinding(provider: NexumLocalFunctionProvider, localFunction: NexumLocalFunction): LocalFunctionBinding {
    const toolName = localToolName(provider.providerID, localFunction.name)
    const definition = toDefinition(toolName, localFunction)
    return { providerID: provider.providerID.trim(), toolName, definition, function: localFunction }
  }

  function unregisterProvider(providerID: string): void {
    const normalizedProviderID = providerID.trim()
    if (!normalizedProviderID) return
    ;[...bindings.entries()]
      .filter(([, binding]) => binding.providerID === normalizedProviderID)
      .forEach(([toolName]) => bindings.delete(toolName))
    refreshCatalog()
  }

  async function executeFunction(request: ToolRequest): Promise<ToolResult> {
    const binding = bindings.get(request.toolName)
    if (!binding) return { ok: false, output: "工具未注册" }
    const invalid = validateInput(binding.function.parameters, request.input)
    if (invalid) return { ok: false, output: invalid, errorCode: "invalid_input", status: "failed" }
    try {
      const output = await binding.function.execute(request.input, {
        sessionID: request.sessionID,
        signal: request.signal ?? new AbortController().signal,
      })
      return { ok: true, output: stringifyOutput(output) }
    } catch {
      return { ok: false, output: "本地函数执行失败", errorCode: "tool_failed", status: "failed" }
    }
  }

  function refreshCatalog(): void {
    const current = [...bindings.values()]
    names.splice(0, names.length, ...current.map((binding) => binding.toolName))
    definitions.splice(0, definitions.length, ...current.map((binding) => binding.definition))
    listeners.forEach((listener) => listener())
  }
}

/**
 * 校验本地函数 provider 的稳定身份和函数目录。
 *
 * @param provider - 待注册的本地函数 provider
 * @returns 无返回值，参数无效时抛出错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function validateProvider(provider: NexumLocalFunctionProvider): void {
  if (!provider.providerID.trim() || !provider.providerName.trim() || provider.functions.length === 0) {
    throw new Error("本地函数 provider 配置无效")
  }
  provider.functions.forEach((localFunction) => {
    if (!localFunction.name.trim() || !localFunction.description.trim()) throw new Error("本地函数定义无效")
  })
}

/**
 * 将本地函数转换为模型工具定义。
 *
 * @param toolName - 稳定的模型工具名称
 * @param localFunction - 本地函数定义
 * @returns 模型可见的工具定义
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function toDefinition(toolName: string, localFunction: NexumLocalFunction): ModelToolDefinition {
  return { name: toolName, description: localFunction.description, parameters: localFunction.parameters }
}

/**
 * 生成本地函数的稳定模型工具名称。
 *
 * @param providerID - provider 稳定 ID
 * @param functionName - 函数稳定名称
 * @returns 带本地来源命名空间的工具名称
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function localToolName(providerID: string, functionName: string): string {
  const provider = providerID.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
  const name = functionName.trim().replace(/[^a-zA-Z0-9_-]+/g, "_")
  return `local__${provider || "provider"}__${name || "function"}`
}

/**
 * 判断两个模型工具定义是否等价。
 *
 * @param left - 已注册定义
 * @param right - 待注册定义
 * @returns 定义是否一致
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function sameDefinition(left: ModelToolDefinition, right: ModelToolDefinition): boolean {
  return left.name === right.name && left.description === right.description && stableStringify(left.parameters) === stableStringify(right.parameters)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}

/**
 * 校验本地函数输入的基础 JSON Schema 约束。
 *
 * @param schema - 函数声明的参数 Schema
 * @param input - 模型返回的函数输入
 * @returns 空值表示通过，否则返回稳定错误文本
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function validateInput(schema: Record<string, unknown>, input: Record<string, unknown>): string | undefined {
  if (schema.type !== undefined && schema.type !== "object") return undefined
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []
  if (required.some((name) => input[name] === undefined)) return "本地函数参数无效"
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const invalid = Object.entries(properties).some(([name, definition]) => input[name] !== undefined && !matchesType(input[name], definition))
  return invalid ? "本地函数参数无效" : undefined
}

/**
 * 判断输入值是否符合 Schema 声明的基础类型。
 *
 * @param value - 待校验的输入值
 * @param schema - 单个属性 Schema
 * @returns 是否符合基础类型
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function matchesType(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema) || typeof schema.type !== "string") return true
  if (schema.type === "array") return Array.isArray(value)
  if (schema.type === "null") return value === null
  if (schema.type === "integer") return typeof value === "number" && Number.isInteger(value)
  return typeof value === schema.type
}

/**
 * 将本地函数结果转换为模型可消费的字符串。
 *
 * @param value - 本地函数返回值
 * @returns 稳定的工具结果文本
 * @author lvdaxianer@yeah.net
 * @date 2026-11-27
 */
function stringifyOutput(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return "本地函数结果无法序列化"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
