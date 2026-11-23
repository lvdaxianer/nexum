/** Nexum Core 的权限策略语义与存储端口。 */

import type { ToolRequest } from "./index.js"

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
