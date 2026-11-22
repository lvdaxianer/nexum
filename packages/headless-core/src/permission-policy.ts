/**
 * Headless Core 的权限策略存储与判定。
 *
 * 语义对齐 CLI 的 allow / ask / deny：规则按 action 和 resource 的通配模式匹配，
 * `action` 为 `*` 时只按 resource 匹配所有工具调用。判定顺序固定为「始终拒绝 →
 * Session 覆盖 → 全局策略 → 每次询问」。因此 Session 覆盖可以收紧或放宽全局允许，
 * 但不能解除拒绝；危险操作只接受精确匹配的允许规则，避免 `* + *` 这类宽泛规则误放行
 * `rm -rf` 或越界写入。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { ToolRequest } from "./index.js"
import { redactHeadlessSensitiveText } from "./redaction.js"

const policyEffects = ["allow", "ask", "deny"] as const
const policyScopes = ["global", "session"] as const
const policyFileVersion = 1
const exactResourceBoost = 1_000

/** action-agnostic 规则使用的 action：该规则只按 resource 匹配所有工具调用。 */
export const headlessAnyToolAction = "*"

/** 工具层的 edit 会归一化成 write，策略匹配时两者互通。 */
const actionAliases: Readonly<Record<string, readonly string[]>> = {
  write: ["write", "edit"],
  edit: ["write", "edit"],
}

/** 文件路径类 action：资源越出工作目录时按危险操作处理。 */
const pathActions: readonly string[] = ["read", "write", "edit"]

/** 危险 shell 命令模式：只允许被精确匹配的规则放行。 */
const destructiveShellPatterns: readonly RegExp[] = [
  /\brm\b/,
  /\bmkfs\b/,
  /\bdd\b[^\n]*\bof=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bpoweroff\b/,
  /\bsudo\b/,
  /\bchmod\s+-[a-z]*r/i,
  /\bchown\s+-[a-z]*r/i,
  /:\s*\(\s*\)\s*\{/,
  /\|\s*(?:sh|bash|zsh|fish)\b/,
  />\s*\/dev\/(?:sd|disk|nvme)/,
]

/** 策略效果：allow 始终允许，ask 每次询问，deny 始终拒绝。 */
export type HeadlessPermissionPolicyEffect = (typeof policyEffects)[number]

/** 策略作用域：global 是全局默认策略，session 是当前 Session 覆盖策略。 */
export type HeadlessPermissionPolicyScope = (typeof policyScopes)[number]

/** 一条可持久化、可修改和删除的权限策略规则。 */
export interface HeadlessPermissionPolicyRule {
  readonly id: string
  readonly action: string
  readonly resource: string
  readonly effect: HeadlessPermissionPolicyEffect
  readonly scope: HeadlessPermissionPolicyScope
  readonly sessionID?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** 新建策略规则的输入。 */
export interface HeadlessPermissionPolicyRuleInput {
  readonly action: string
  readonly resource: string
  readonly effect: string
  readonly scope?: string
  readonly sessionID?: string
}

/** 修改策略规则的输入；未提供的字段保留原值。 */
export interface HeadlessPermissionPolicyRuleUpdate {
  readonly action?: string
  readonly resource?: string
  readonly effect?: string
}

/** 策略查询过滤条件。 */
export interface HeadlessPermissionPolicyFilter {
  readonly sessionID?: string
}

/** 策略判定来源。 */
export type HeadlessPermissionPolicySource = HeadlessPermissionPolicyScope | "default"

/** 一次策略判定的结果，reason 用于向 UI 解释判定依据。 */
export interface HeadlessPermissionPolicyDecision {
  readonly effect: HeadlessPermissionPolicyEffect
  readonly source: HeadlessPermissionPolicySource
  readonly ruleID?: string
  readonly reason: string
}

/** 策略存储领域错误码。 */
export type HeadlessPermissionPolicyErrorCode =
  | "invalid_rule"
  | "invalid_effect"
  | "invalid_scope"
  | "missing_session"
  | "duplicate_rule"
  | "not_found"
  | "invalid_file"

/** 策略存储领域错误。 */
export class HeadlessPermissionPolicyError extends Error {
  constructor(
    readonly code: HeadlessPermissionPolicyErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessPermissionPolicyError"
  }
}

/** 可持久化的权限策略 CRUD 端口。 */
export interface HeadlessPermissionPolicyStore {
  readonly list: (filter?: HeadlessPermissionPolicyFilter) => Promise<readonly HeadlessPermissionPolicyRule[]>
  readonly get: (ruleID: string) => Promise<HeadlessPermissionPolicyRule | undefined>
  readonly add: (input: HeadlessPermissionPolicyRuleInput) => Promise<HeadlessPermissionPolicyRule>
  readonly update: (ruleID: string, input: HeadlessPermissionPolicyRuleUpdate) => Promise<HeadlessPermissionPolicyRule>
  readonly remove: (ruleID: string) => Promise<HeadlessPermissionPolicyRule>
}

/** 文件策略 Store 配置。 */
export interface FilePermissionPolicyStoreOptions {
  readonly filePath: string
}

/**
 * 创建进程内策略 Store。
 *
 * @returns 进程退出即失效的策略端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function createInMemoryPermissionPolicyStore(): HeadlessPermissionPolicyStore {
  let rules = new Map<string, HeadlessPermissionPolicyRule>()
  return createPolicyStore({
    read: async () => rules,
    write: async (next) => {
      rules = next
    },
  })
}

/**
 * 创建基于 JSON 文件的策略 Store。
 *
 * 写入使用临时文件加 rename 保证原子性，文件不可解析时抛出稳定的 `invalid_file`
 * 错误且不覆盖原文件；规则在落盘前统一脱敏，避免凭据形状的命令被写入磁盘。
 *
 * @param options - 策略文件路径
 * @returns 可跨进程重启恢复的策略端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function createFilePermissionPolicyStore(options: FilePermissionPolicyStoreOptions): HeadlessPermissionPolicyStore {
  let loaded: Promise<Map<string, HeadlessPermissionPolicyRule>> | undefined
  let writeQueue: Promise<void> = Promise.resolve()

  const load = async () => {
    if (!loaded) loaded = readPolicyFile(options.filePath)
    return loaded
  }

  return createPolicyStore({
    read: load,
    write: async (rules) => {
      const operation = writeQueue.then(async () => {
        await persistPolicyFile(options.filePath, rules)
        loaded = Promise.resolve(rules)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  })
}

/**
 * 按固定顺序判定一次工具请求。
 *
 * @param request - 归一化后的工具请求
 * @param rules - 当前全部策略规则
 * @returns 最终效果、命中来源和可展示的判定依据
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function evaluateHeadlessPermissionPolicy(
  request: ToolRequest,
  rules: readonly HeadlessPermissionPolicyRule[],
): HeadlessPermissionPolicyDecision {
  const applicable = rules.filter((rule) => rule.scope === "global" || rule.sessionID === request.sessionID)
  const matched = matchingRules(applicable, request)
  const denied = matched.find((rule) => rule.effect === "deny")
  if (denied) return decisionFor(denied)

  const dangerous = isDangerousHeadlessToolRequest(request)
  const usable = matched.filter(
    (rule) => rule.effect === "ask" || !dangerous || isExactResourceRule(rule, request.resource),
  )
  const session = usable.find((rule) => rule.scope === "session")
  if (session) return decisionFor(session)
  const global = usable.find((rule) => rule.scope === "global")
  if (global) return decisionFor(global)
  if (dangerous && matched.some((rule) => rule.effect === "allow")) {
    return { effect: "ask", source: "default", reason: "危险操作只能由精确匹配的允许规则放行" }
  }
  return { effect: "ask", source: "default", reason: "未命中策略，默认每次询问" }
}

/**
 * 判断请求是否属于危险操作。
 *
 * 危险操作不会因为宽泛通配规则被自动放行；调用方仍需精确规则或逐次批准。
 *
 * @param request - 归一化后的工具请求
 * @returns 是否属于危险操作
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function isDangerousHeadlessToolRequest(request: ToolRequest): boolean {
  if (request.action === "shell") return destructiveShellPatterns.some((pattern) => pattern.test(request.resource))
  if (!pathActions.includes(request.action)) return false
  return escapesSessionDirectory(request.resource)
}

/**
 * 与 CLI 一致的通配匹配：`*` 匹配任意字符，`?` 匹配单个字符，忽略大小写。
 *
 * @param value - 待匹配的 action 或 resource
 * @param pattern - 规则中的通配模式
 * @returns 是否命中
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function matchHeadlessPermissionPattern(value: string, pattern: string): boolean {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "si").test(value.replaceAll("\\", "/"))
}

interface PolicySource {
  readonly read: () => Promise<Map<string, HeadlessPermissionPolicyRule>>
  readonly write: (rules: Map<string, HeadlessPermissionPolicyRule>) => Promise<void>
}

function createPolicyStore(source: PolicySource): HeadlessPermissionPolicyStore {
  const mutate = async <T>(apply: (rules: Map<string, HeadlessPermissionPolicyRule>) => T): Promise<T> => {
    const next = new Map(await source.read())
    const result = apply(next)
    await source.write(next)
    return result
  }

  return {
    async list(filter) {
      const rules = Array.from((await source.read()).values())
      return sortPolicyRules(filterPolicyRules(rules, filter))
    },
    async get(ruleID) {
      return (await source.read()).get(ruleID) ?? undefined
    },
    add(input) {
      return mutate((rules) => {
        const normalized = normalizeRuleInput(input)
        assertNoDuplicateRule(rules, normalized)
        const timestamp = new Date().toISOString()
        const rule: HeadlessPermissionPolicyRule = {
          id: `hpr_${randomUUID()}`,
          ...normalized,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        rules.set(rule.id, rule)
        return rule
      })
    },
    update(ruleID, input) {
      return mutate((rules) => {
        const current = rules.get(ruleID)
        if (!current) throw policyNotFound()
        const next: HeadlessPermissionPolicyRule = {
          ...current,
          ...(input.action === undefined ? {} : { action: requirePolicyAction(input.action) }),
          ...(input.resource === undefined ? {} : { resource: requirePolicyResource(input.resource) }),
          ...(input.effect === undefined ? {} : { effect: requirePolicyEffect(input.effect) }),
          updatedAt: nextPolicyTimestamp(current.updatedAt),
        }
        assertNoDuplicateRule(rules, next, ruleID)
        rules.set(ruleID, next)
        return next
      })
    },
    remove(ruleID) {
      return mutate((rules) => {
        const current = rules.get(ruleID)
        if (!current) throw policyNotFound()
        rules.delete(ruleID)
        return current
      })
    },
  }
}

interface NormalizedRule {
  readonly action: string
  readonly resource: string
  readonly effect: HeadlessPermissionPolicyEffect
  readonly scope: HeadlessPermissionPolicyScope
  readonly sessionID?: string
}

function normalizeRuleInput(input: HeadlessPermissionPolicyRuleInput): NormalizedRule {
  const scope = requirePolicyScope(input.scope ?? "global")
  const sessionID = typeof input.sessionID === "string" ? input.sessionID.trim() : ""
  if (scope === "session" && !sessionID) {
    throw new HeadlessPermissionPolicyError("missing_session", "Session 作用域的策略必须指定 Session")
  }
  return {
    action: requirePolicyAction(input.action),
    resource: requirePolicyResource(input.resource),
    effect: requirePolicyEffect(input.effect),
    scope,
    ...(scope === "session" ? { sessionID } : {}),
  }
}

function requirePolicyAction(value: string): string {
  const action = value.trim().toLowerCase()
  if (!action) throw new HeadlessPermissionPolicyError("invalid_rule", "策略 action 不能为空")
  if (action === headlessAnyToolAction) return headlessAnyToolAction
  if (containsWildcard(action)) {
    throw new HeadlessPermissionPolicyError("invalid_rule", "策略 action 只支持具体工具名，或使用 * 匹配所有工具")
  }
  return action
}

function requirePolicyResource(value: string): string {
  const resource = redactHeadlessSensitiveText(value.trim())
  if (!resource) throw new HeadlessPermissionPolicyError("invalid_rule", "策略 resource 不能为空")
  return resource
}

function requirePolicyEffect(value: string): HeadlessPermissionPolicyEffect {
  if (!isPolicyEffect(value)) throw new HeadlessPermissionPolicyError("invalid_effect", "策略效果必须是 allow、ask 或 deny")
  return value
}

function requirePolicyScope(value: string): HeadlessPermissionPolicyScope {
  if (!isPolicyScope(value)) throw new HeadlessPermissionPolicyError("invalid_scope", "策略作用域必须是 global 或 session")
  return value
}

function assertNoDuplicateRule(
  rules: ReadonlyMap<string, HeadlessPermissionPolicyRule>,
  candidate: NormalizedRule,
  ignoreRuleID?: string,
): void {
  const duplicated = Array.from(rules.values()).some(
    (rule) =>
      rule.id !== ignoreRuleID &&
      rule.action === candidate.action &&
      rule.resource === candidate.resource &&
      rule.effect === candidate.effect &&
      rule.scope === candidate.scope &&
      rule.sessionID === candidate.sessionID,
  )
  if (duplicated) throw new HeadlessPermissionPolicyError("duplicate_rule", "已存在相同的权限策略")
}

function matchingRules(
  rules: readonly HeadlessPermissionPolicyRule[],
  request: ToolRequest,
): HeadlessPermissionPolicyRule[] {
  const actions = actionAliases[request.action] ?? [request.action]
  return rules
    .filter(
      (rule) =>
        (rule.action === headlessAnyToolAction ||
          actions.some((action) => matchHeadlessPermissionPattern(action, rule.action))) &&
        matchHeadlessPermissionPattern(request.resource, rule.resource),
    )
    .sort(comparePolicyRules)
}

/** 精确资源规则优先于通配规则，其次按最近修改时间倒序，最后用 ID 保证稳定。 */
function comparePolicyRules(left: HeadlessPermissionPolicyRule, right: HeadlessPermissionPolicyRule): number {
  const specificity = policySpecificity(right) - policySpecificity(left)
  if (specificity !== 0) return specificity
  const updated = right.updatedAt.localeCompare(left.updatedAt)
  if (updated !== 0) return updated
  return left.id.localeCompare(right.id)
}

function policySpecificity(rule: HeadlessPermissionPolicyRule): number {
  const literalLength = rule.resource.replaceAll("*", "").replaceAll("?", "").length
  return containsWildcard(rule.resource) ? literalLength : literalLength + exactResourceBoost
}

function isExactResourceRule(rule: HeadlessPermissionPolicyRule, resource: string): boolean {
  return !containsWildcard(rule.resource) && rule.resource === resource.trim()
}

function containsWildcard(value: string): boolean {
  return value.includes("*") || value.includes("?")
}

function escapesSessionDirectory(resource: string): boolean {
  const normalized = resource.replaceAll("\\", "/").trim()
  if (!normalized) return true
  if (normalized.startsWith("/") || normalized.startsWith("~")) return true
  return normalized.split("/").some((segment) => segment === "..")
}

function decisionFor(rule: HeadlessPermissionPolicyRule): HeadlessPermissionPolicyDecision {
  const scope = rule.scope === "session" ? "Session 覆盖策略" : "全局默认策略"
  const tools = rule.action === headlessAnyToolAction ? "所有工具" : rule.action
  return {
    effect: rule.effect,
    source: rule.scope,
    ruleID: rule.id,
    reason: `命中${scope}：${tools} ${rule.resource}`,
  }
}

function filterPolicyRules(
  rules: readonly HeadlessPermissionPolicyRule[],
  filter?: HeadlessPermissionPolicyFilter,
): HeadlessPermissionPolicyRule[] {
  if (!filter?.sessionID) return [...rules]
  return rules.filter((rule) => rule.scope === "global" || rule.sessionID === filter.sessionID)
}

function sortPolicyRules(rules: HeadlessPermissionPolicyRule[]): HeadlessPermissionPolicyRule[] {
  return rules.sort((left, right) => {
    const scope = left.scope.localeCompare(right.scope)
    if (scope !== 0) return scope
    const created = left.createdAt.localeCompare(right.createdAt)
    if (created !== 0) return created
    return left.id.localeCompare(right.id)
  })
}

function policyNotFound(): HeadlessPermissionPolicyError {
  return new HeadlessPermissionPolicyError("not_found", "权限策略不存在")
}

function nextPolicyTimestamp(previous: string): string {
  const current = Date.now()
  const previousTime = Date.parse(previous)
  return new Date(Math.max(current, Number.isNaN(previousTime) ? current : previousTime + 1)).toISOString()
}

function isPolicyEffect(value: string): value is HeadlessPermissionPolicyEffect {
  return (policyEffects as readonly string[]).includes(value)
}

function isPolicyScope(value: string): value is HeadlessPermissionPolicyScope {
  return (policyScopes as readonly string[]).includes(value)
}

async function readPolicyFile(filePath: string): Promise<Map<string, HeadlessPermissionPolicyRule>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return new Map()
  const payload = parsePolicyFile(text)
  return new Map(payload.rules.map((rule) => [rule.id, rule]))
}

async function persistPolicyFile(
  filePath: string,
  rules: Map<string, HeadlessPermissionPolicyRule>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload = JSON.stringify(
    { version: policyFileVersion, rules: sortPolicyRules(Array.from(rules.values())) },
    null,
    2,
  )
  await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function parsePolicyFile(text: string): { rules: readonly HeadlessPermissionPolicyRule[] } {
  const payload = parseJson(text)
  if (!isRecord(payload) || payload.version !== policyFileVersion || !Array.isArray(payload.rules)) {
    throw invalidPolicyFile()
  }
  return { rules: payload.rules.map((rule) => parsePolicyRule(rule)) }
}

function parsePolicyRule(value: unknown): HeadlessPermissionPolicyRule {
  if (!isRecord(value)) throw invalidPolicyFile()
  const { id, action, resource, effect, scope, sessionID, createdAt, updatedAt } = value
  if (typeof id !== "string" || !id) throw invalidPolicyFile()
  if (typeof action !== "string" || typeof resource !== "string") throw invalidPolicyFile()
  if (typeof effect !== "string" || !isPolicyEffect(effect)) throw invalidPolicyFile()
  if (typeof scope !== "string" || !isPolicyScope(scope)) throw invalidPolicyFile()
  if (scope === "session" && typeof sessionID !== "string") throw invalidPolicyFile()
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") throw invalidPolicyFile()
  return {
    id,
    action,
    resource,
    effect,
    scope,
    ...(scope === "session" && typeof sessionID === "string" ? { sessionID } : {}),
    createdAt,
    updatedAt,
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw invalidPolicyFile()
  }
}

function invalidPolicyFile(): HeadlessPermissionPolicyError {
  return new HeadlessPermissionPolicyError("invalid_file", "权限策略文件格式无效")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
