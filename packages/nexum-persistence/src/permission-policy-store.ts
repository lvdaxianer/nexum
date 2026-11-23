/** 权限策略规则的内存和文件持久化实现。 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  NexumPermissionPolicyError,
  nexumAnyToolAction,
  redactNexumSensitiveText,
} from "@nexum/core"
import type {
  NexumPermissionPolicyEffect,
  NexumPermissionPolicyFilter,
  NexumPermissionPolicyRule,
  NexumPermissionPolicyRuleInput,
  NexumPermissionPolicyScope,
  NexumPermissionPolicyStore,
} from "@nexum/core"

const policyEffects = ["allow", "ask", "deny"] as const
const policyScopes = ["global", "session"] as const
const policyFileVersion = 1

/** 文件策略 Store 配置。 */
export interface FilePermissionPolicyStoreOptions {
  readonly filePath: string
}

/** 创建进程内策略 Store。 */
export function createInMemoryPermissionPolicyStore(): NexumPermissionPolicyStore {
  let rules = new Map<string, NexumPermissionPolicyRule>()
  return createPolicyStore({
    read: async () => rules,
    write: async (next) => {
      rules = next
    },
  })
}

/** 创建基于 JSON 文件的策略 Store。 */
export function createFilePermissionPolicyStore(options: FilePermissionPolicyStoreOptions): NexumPermissionPolicyStore {
  let loaded: Promise<Map<string, NexumPermissionPolicyRule>> | undefined
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
      return (await source.read()).get(ruleID) ?? undefined
    },
    add(input) {
      return mutate((rules) => {
        const normalized = normalizeRuleInput(input)
        assertNoDuplicateRule(rules, normalized)
        const timestamp = new Date().toISOString()
        const rule: NexumPermissionPolicyRule = {
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
  readonly effect: NexumPermissionPolicyEffect
  readonly scope: NexumPermissionPolicyScope
  readonly sessionID?: string
}

function normalizeRuleInput(input: NexumPermissionPolicyRuleInput): NormalizedRule {
  const scope = requirePolicyScope(input.scope ?? "global")
  const sessionID = typeof input.sessionID === "string" ? input.sessionID.trim() : ""
  if (scope === "session" && !sessionID) {
    throw new NexumPermissionPolicyError("missing_session", "Session 作用域的策略必须指定 Session")
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
  if (!action) throw new NexumPermissionPolicyError("invalid_rule", "策略 action 不能为空")
  if (action === nexumAnyToolAction) return nexumAnyToolAction
  if (containsWildcard(action)) {
    throw new NexumPermissionPolicyError("invalid_rule", "策略 action 只支持具体工具名，或使用 * 匹配所有工具")
  }
  return action
}

function requirePolicyResource(value: string): string {
  const resource = redactNexumSensitiveText(value.trim())
  if (!resource) throw new NexumPermissionPolicyError("invalid_rule", "策略 resource 不能为空")
  return resource
}

function requirePolicyEffect(value: string): NexumPermissionPolicyEffect {
  if (!isPolicyEffect(value)) throw new NexumPermissionPolicyError("invalid_effect", "策略效果必须是 allow、ask 或 deny")
  return value
}

function requirePolicyScope(value: string): NexumPermissionPolicyScope {
  if (!isPolicyScope(value)) throw new NexumPermissionPolicyError("invalid_scope", "策略作用域必须是 global 或 session")
  return value
}

function assertNoDuplicateRule(
  rules: ReadonlyMap<string, NexumPermissionPolicyRule>,
  candidate: NormalizedRule | NexumPermissionPolicyRule,
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
  if (duplicated) throw new NexumPermissionPolicyError("duplicate_rule", "已存在相同的权限策略")
}

function filterPolicyRules(
  rules: readonly NexumPermissionPolicyRule[],
  filter?: NexumPermissionPolicyFilter,
): NexumPermissionPolicyRule[] {
  if (!filter?.sessionID) return [...rules]
  return rules.filter((rule) => rule.scope === "global" || rule.sessionID === filter.sessionID)
}

function sortPolicyRules(rules: NexumPermissionPolicyRule[]): NexumPermissionPolicyRule[] {
  return rules.sort((left, right) => {
    const scope = left.scope.localeCompare(right.scope)
    if (scope !== 0) return scope
    const created = left.createdAt.localeCompare(right.createdAt)
    if (created !== 0) return created
    return left.id.localeCompare(right.id)
  })
}

function policyNotFound(): NexumPermissionPolicyError {
  return new NexumPermissionPolicyError("not_found", "权限策略不存在")
}

function nextPolicyTimestamp(previous: string): string {
  const current = Date.now()
  const previousTime = Date.parse(previous)
  return new Date(Math.max(current, Number.isNaN(previousTime) ? current : previousTime + 1)).toISOString()
}

function containsWildcard(value: string): boolean {
  return value.includes("*") || value.includes("?")
}

function isPolicyEffect(value: string): value is NexumPermissionPolicyEffect {
  return (policyEffects as readonly string[]).includes(value)
}

function isPolicyScope(value: string): value is NexumPermissionPolicyScope {
  return (policyScopes as readonly string[]).includes(value)
}

async function readPolicyFile(filePath: string): Promise<Map<string, NexumPermissionPolicyRule>> {
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
  rules: Map<string, NexumPermissionPolicyRule>,
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

function parsePolicyFile(text: string): { rules: readonly NexumPermissionPolicyRule[] } {
  const payload = parseJson(text)
  if (!isRecord(payload) || payload.version !== policyFileVersion || !Array.isArray(payload.rules)) {
    throw invalidPolicyFile()
  }
  return { rules: payload.rules.map((rule) => parsePolicyRule(rule)) }
}

function parsePolicyRule(value: unknown): NexumPermissionPolicyRule {
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

function invalidPolicyFile(): NexumPermissionPolicyError {
  return new NexumPermissionPolicyError("invalid_file", "权限策略文件格式无效")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
