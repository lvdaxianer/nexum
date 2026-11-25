/**
 * Nexum Plugin 的顶层描述、校验和 Registry 端口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */

/** Plugin 的可观测生命周期状态。 */
export type NexumPluginStatus = "registered" | "activating" | "active" | "failed" | "disabled"

/** Plugin 可以向 Runtime 导出的内部能力类型。 */
export type NexumPluginExportKind = "skill" | "function" | "workflow" | "hook"

/** Plugin 内部能力的安全描述。 */
export interface NexumPluginExport {
  readonly id: string
  readonly kind: NexumPluginExportKind
  readonly description: string
}

/** Plugin 自然语言路由所需的轻量描述。 */
export interface NexumPluginRouting {
  readonly intents: readonly string[]
  readonly examples: readonly string[]
  readonly keywords: readonly string[]
}

/** Plugin 的宿主无关 Manifest。 */
export interface NexumPluginManifest {
  readonly id: string
  readonly version: string
  readonly description: string
  readonly routing: NexumPluginRouting
  readonly exports: readonly NexumPluginExport[]
  readonly permissions: readonly string[]
}

/** Plugin 注册后可安全返回给 UI、Router 和模型的摘要。 */
export interface NexumPluginSummary extends NexumPluginManifest {
  readonly status: NexumPluginStatus
  readonly diagnostics: readonly string[]
}

/** Plugin Manifest 校验错误码。 */
export type NexumPluginManifestIssueCode =
  | "invalid_manifest"
  | "invalid_id"
  | "invalid_version"
  | "invalid_description"
  | "invalid_routing"
  | "invalid_exports"
  | "invalid_export"
  | "duplicate_export"
  | "invalid_permissions"

/** Plugin Manifest 校验错误的稳定位置和错误码。 */
export interface NexumPluginManifestIssue {
  readonly code: NexumPluginManifestIssueCode
  readonly path: string
}

/** Plugin 注册与摘要读取的最小端口。 */
export interface NexumPluginRegistry {
  readonly list: () => Promise<readonly NexumPluginSummary[]>
  readonly get: (id: string) => Promise<NexumPluginSummary | undefined>
  readonly register: (manifest: NexumPluginManifest) => Promise<NexumPluginSummary>
}

const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PLUGIN_EXPORT_KINDS: readonly NexumPluginExportKind[] = ["skill", "function", "workflow", "hook"]

/**
 * 校验 Plugin Manifest 的公开契约，不执行 Plugin 运行时代码。
 *
 * @param input - 未信任的 Manifest 输入
 * @returns 按稳定路径返回的校验问题；空数组表示通过
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function validateNexumPluginManifest(input: unknown): readonly NexumPluginManifestIssue[] {
  if (!isRecord(input)) return [{ code: "invalid_manifest", path: "manifest" }]
  return [
    ...validatePluginIdentity(input),
    ...validatePluginRouting(input.routing),
    ...validatePluginExports(input.exports),
    ...validatePluginPermissions(input.permissions),
  ]
}

/**
 * 校验 Plugin 的身份字段。
 *
 * @param input - Manifest 的未知对象
 * @returns 身份字段的校验问题
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function validatePluginIdentity(input: Record<string, unknown>): readonly NexumPluginManifestIssue[] {
  return [
    ...(isPluginID(input.id) ? [] : [{ code: "invalid_id" as const, path: "id" }]),
    ...(isNonEmptyString(input.version) ? [] : [{ code: "invalid_version" as const, path: "version" }]),
    ...(isNonEmptyString(input.description) ? [] : [{ code: "invalid_description" as const, path: "description" }]),
  ]
}

/**
 * 校验自然语言路由元数据。
 *
 * @param input - routing 字段的未知值
 * @returns 路由字段的校验问题
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function validatePluginRouting(input: unknown): readonly NexumPluginManifestIssue[] {
  if (!isRecord(input)) return [{ code: "invalid_routing", path: "routing" }]
  const fields = ["intents", "examples", "keywords"] as const
  return fields.flatMap((field) => (isStringArray(input[field]) ? [] : [{ code: "invalid_routing" as const, path: `routing.${field}` }]))
}

/**
 * 校验 Plugin 的导出能力并拒绝重复 ID。
 *
 * @param input - exports 字段的未知值
 * @returns 导出能力的校验问题
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function validatePluginExports(input: unknown): readonly NexumPluginManifestIssue[] {
  if (!Array.isArray(input)) return [{ code: "invalid_exports", path: "exports" }]
  const issues = input.flatMap((item, index) => validatePluginExport(item, index))
  const ids = input.filter(isRecord).map((item) => item.id).filter(isNonEmptyString)
  const duplicate = ids.filter((id, index) => ids.indexOf(id) !== index)
  return duplicate.length === 0 ? issues : [...issues, { code: "duplicate_export", path: "exports" }]
}

/**
 * 校验一个导出能力的字段。
 *
 * @param input - 导出能力的未知值
 * @param index - 导出能力在 Manifest 中的索引
 * @returns 导出能力的校验问题
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function validatePluginExport(input: unknown, index: number): readonly NexumPluginManifestIssue[] {
  if (!isRecord(input)) return [{ code: "invalid_export", path: `exports.${index}` }]
  const validID = isNonEmptyString(input.id)
  const validKind = typeof input.kind === "string" && PLUGIN_EXPORT_KINDS.includes(input.kind as NexumPluginExportKind)
  const validDescription = isNonEmptyString(input.description)
  return validID && validKind && validDescription ? [] : [{ code: "invalid_export", path: `exports.${index}` }]
}

/**
 * 校验 Plugin 声明的权限列表。
 *
 * @param input - permissions 字段的未知值
 * @returns 权限字段的校验问题
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function validatePluginPermissions(input: unknown): readonly NexumPluginManifestIssue[] {
  return isStringArray(input) ? [] : [{ code: "invalid_permissions", path: "permissions" }]
}

/**
 * 判断值是否为普通对象。
 *
 * @param input - 待判断值
 * @returns 是否为非空对象记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

/**
 * 判断值是否为非空字符串。
 *
 * @param input - 待判断值
 * @returns 是否为非空字符串
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0
}

/**
 * 判断值是否为合法 Plugin ID。
 *
 * @param input - 待判断值
 * @returns 是否符合顶层 Plugin 命名规则
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isPluginID(input: unknown): input is string {
  return typeof input === "string" && PLUGIN_ID_PATTERN.test(input)
}

/**
 * 判断值是否为字符串数组。
 *
 * @param input - 待判断值
 * @returns 是否为只包含字符串的数组
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isStringArray(input: unknown): input is readonly string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string")
}
