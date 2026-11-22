/** Nexum Core 的权限策略语义与存储端口。 */

import type { ToolRequest } from "./index.js"
import { redactNexumSensitiveText } from "./redaction.js"

const policyEffects = ["allow", "ask", "deny"] as const
const policyScopes = ["global", "session"] as const
const exactResourceBoost = 1_000

/** action-agnostic 规则使用的 action。 */
export const nexumAnyToolAction = "*"

const actionAliases: Readonly<Record<string, readonly string[]>> = {
  write: ["write", "edit"],
  edit: ["write", "edit"],
}

const pathActions = ["read", "write", "edit"] as const
const destructiveShellPatterns = [
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

export type NexumPermissionPolicyEffect = (typeof policyEffects)[number]
export type NexumPermissionPolicyScope = (typeof policyScopes)[number]

export interface NexumPermissionPolicyRule {
  readonly id: string
  readonly action: string
  readonly resource: string
  readonly effect: NexumPermissionPolicyEffect
  readonly scope: NexumPermissionPolicyScope
  readonly sessionID?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface NexumPermissionPolicyRuleInput {
  readonly action: string
  readonly resource: string
  readonly effect: string
  readonly scope?: string
  readonly sessionID?: string
}

export interface NexumPermissionPolicyRuleUpdate {
  readonly action?: string
  readonly resource?: string
  readonly effect?: string
}

export interface NexumPermissionPolicyFilter {
  readonly sessionID?: string
}

export type NexumPermissionPolicySource = NexumPermissionPolicyScope | "default"

export interface NexumPermissionPolicyDecision {
  readonly effect: NexumPermissionPolicyEffect
  readonly source: NexumPermissionPolicySource
  readonly ruleID?: string
  readonly reason: string
}

export type NexumPermissionPolicyErrorCode =
  | "invalid_rule"
  | "invalid_effect"
  | "invalid_scope"
  | "missing_session"
  | "duplicate_rule"
  | "not_found"
  | "invalid_file"

export class NexumPermissionPolicyError extends Error {
  constructor(
    readonly code: NexumPermissionPolicyErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumPermissionPolicyError"
  }
}

export interface NexumPermissionPolicyStore {
  readonly list: (filter?: NexumPermissionPolicyFilter) => Promise<readonly NexumPermissionPolicyRule[]>
  readonly get: (ruleID: string) => Promise<NexumPermissionPolicyRule | undefined>
  readonly add: (input: NexumPermissionPolicyRuleInput) => Promise<NexumPermissionPolicyRule>
  readonly update: (ruleID: string, input: NexumPermissionPolicyRuleUpdate) => Promise<NexumPermissionPolicyRule>
  readonly remove: (ruleID: string) => Promise<NexumPermissionPolicyRule>
}

/** 创建仅存在于当前进程的策略 Store，供纯 Core 测试和嵌入式运行使用。 */
export function createInMemoryPermissionPolicyStore(): NexumPermissionPolicyStore {
  let rules = new Map<string, NexumPermissionPolicyRule>()
  return createPolicyStore({
    read: async () => rules,
    write: async (next) => {
      rules = next
    },
  })
}

/** 按固定顺序判定一次工具请求。 */
export function evaluateNexumPermissionPolicy(
  request: ToolRequest,
  rules: readonly NexumPermissionPolicyRule[],
): NexumPermissionPolicyDecision {
  const applicable = rules.filter((rule) => rule.scope === "global" || rule.sessionID === request.sessionID)
  const matched = matchingRules(applicable, request)
  const denied = matched.find((rule) => rule.effect === "deny")
  if (denied) return decisionFor(denied)
  const dangerous = isDangerousNexumToolRequest(request)
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

/** 判断请求是否属于危险操作。 */
export function isDangerousNexumToolRequest(request: ToolRequest): boolean {
  if (request.action === "shell") return destructiveShellPatterns.some((pattern) => pattern.test(request.resource))
  if (!pathActions.includes(request.action as (typeof pathActions)[number])) return false
  const normalized = request.resource.replaceAll("\\", "/").trim()
  return !normalized || normalized.startsWith("/") || normalized.startsWith("~") || normalized.split("/").includes("..")
}

/** 与 CLI 一致的通配匹配。 */
export function matchNexumPermissionPattern(value: string, pattern: string): boolean {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "si").test(value.replaceAll("\\", "/"))
}

interface PolicySource {
  readonly read: () => Promise<Map<string, NexumPermissionPolicyRule>>
  readonly write: (rules: Map<string, NexumPermissionPolicyRule>) => Promise<void>
}

function createPolicyStore(source: PolicySource): NexumPermissionPolicyStore {
  const mutate = async <T>(apply: (rules: Map<string, NexumPermissionPolicyRule>) => T): Promise<T> => {
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
      return (await source.read()).get(ruleID)
    },
    add(input) {
      return mutate((rules) => {
        const normalized = normalizeRuleInput(input)
        assertNoDuplicateRule(rules, normalized)
        const timestamp = new Date().toISOString()
        const rule: NexumPermissionPolicyRule = { id: `hpr_${crypto.randomUUID()}`, ...normalized, createdAt: timestamp, updatedAt: timestamp }
        rules.set(rule.id, rule)
        return rule
      })
    },
    update(ruleID, input) {
      return mutate((rules) => {
        const current = rules.get(ruleID)
        if (!current) throw new NexumPermissionPolicyError("not_found", "权限策略不存在")
        const next: NexumPermissionPolicyRule = {
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
        if (!current) throw new NexumPermissionPolicyError("not_found", "权限策略不存在")
        rules.delete(ruleID)
        return current
      })
    },
  }
}

interface NormalizedRule {
  readonly action: string
  readonly resource: string
  readonly effect: NexumPermissionPolicyEffect
  readonly scope: NexumPermissionPolicyScope
  readonly sessionID?: string
}

function normalizeRuleInput(input: NexumPermissionPolicyRuleInput): NormalizedRule {
  const scope = requirePolicyScope(input.scope ?? "global")
  const sessionID = typeof input.sessionID === "string" ? input.sessionID.trim() : ""
  if (scope === "session" && !sessionID) throw new NexumPermissionPolicyError("missing_session", "Session 作用域的策略必须指定 Session")
  return { action: requirePolicyAction(input.action), resource: requirePolicyResource(input.resource), effect: requirePolicyEffect(input.effect), scope, ...(scope === "session" ? { sessionID } : {}) }
}

function requirePolicyAction(value: string): string {
  const action = value.trim().toLowerCase()
  if (!action) throw new NexumPermissionPolicyError("invalid_rule", "策略 action 不能为空")
  if (action === nexumAnyToolAction) return action
  if (action.includes("*") || action.includes("?")) throw new NexumPermissionPolicyError("invalid_rule", "策略 action 只支持具体工具名，或使用 * 匹配所有工具")
  return action
}

function requirePolicyResource(value: string): string {
  const resource = redactNexumSensitiveText(value.trim())
  if (!resource) throw new NexumPermissionPolicyError("invalid_rule", "策略 resource 不能为空")
  return resource
}

function requirePolicyEffect(value: string): NexumPermissionPolicyEffect {
  if (!(policyEffects as readonly string[]).includes(value)) throw new NexumPermissionPolicyError("invalid_effect", "策略效果必须是 allow、ask 或 deny")
  return value as NexumPermissionPolicyEffect
}

function requirePolicyScope(value: string): NexumPermissionPolicyScope {
  if (!(policyScopes as readonly string[]).includes(value)) throw new NexumPermissionPolicyError("invalid_scope", "策略作用域必须是 global 或 session")
  return value as NexumPermissionPolicyScope
}

function assertNoDuplicateRule(rules: ReadonlyMap<string, NexumPermissionPolicyRule>, candidate: NormalizedRule, ignoreRuleID?: string): void {
  const duplicated = Array.from(rules.values()).some((rule) => rule.id !== ignoreRuleID && rule.action === candidate.action && rule.resource === candidate.resource && rule.effect === candidate.effect && rule.scope === candidate.scope && rule.sessionID === candidate.sessionID)
  if (duplicated) throw new NexumPermissionPolicyError("duplicate_rule", "已存在相同的权限策略")
}

function matchingRules(rules: readonly NexumPermissionPolicyRule[], request: ToolRequest): NexumPermissionPolicyRule[] {
  const actions = actionAliases[request.action] ?? [request.action]
  return rules.filter((rule) => (rule.action === nexumAnyToolAction || actions.some((action) => matchNexumPermissionPattern(action, rule.action))) && matchNexumPermissionPattern(request.resource, rule.resource)).sort(comparePolicyRules)
}

function comparePolicyRules(left: NexumPermissionPolicyRule, right: NexumPermissionPolicyRule): number {
  const specificity = policySpecificity(right) - policySpecificity(left)
  if (specificity !== 0) return specificity
  const updated = right.updatedAt.localeCompare(left.updatedAt)
  return updated !== 0 ? updated : left.id.localeCompare(right.id)
}

function policySpecificity(rule: NexumPermissionPolicyRule): number {
  const literalLength = rule.resource.replaceAll("*", "").replaceAll("?", "").length
  return rule.resource.includes("*") || rule.resource.includes("?") ? literalLength : literalLength + exactResourceBoost
}

function isExactResourceRule(rule: NexumPermissionPolicyRule, resource: string): boolean {
  return !rule.resource.includes("*") && !rule.resource.includes("?") && rule.resource === resource.trim()
}

function decisionFor(rule: NexumPermissionPolicyRule): NexumPermissionPolicyDecision {
  const scope = rule.scope === "session" ? "Session 覆盖策略" : "全局默认策略"
  const tools = rule.action === nexumAnyToolAction ? "所有工具" : rule.action
  return { effect: rule.effect, source: rule.scope, ruleID: rule.id, reason: `命中${scope}：${tools} ${rule.resource}` }
}

function filterPolicyRules(rules: readonly NexumPermissionPolicyRule[], filter?: NexumPermissionPolicyFilter): NexumPermissionPolicyRule[] {
  if (!filter?.sessionID) return [...rules]
  return rules.filter((rule) => rule.scope === "global" || rule.sessionID === filter.sessionID)
}

function sortPolicyRules(rules: NexumPermissionPolicyRule[]): NexumPermissionPolicyRule[] {
  return rules.sort((left, right) => left.scope.localeCompare(right.scope) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function nextPolicyTimestamp(previous: string): string {
  const current = Date.now()
  const previousTime = Date.parse(previous)
  return new Date(Math.max(current, Number.isNaN(previousTime) ? current : previousTime + 1)).toISOString()
}
