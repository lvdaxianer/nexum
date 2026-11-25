import { randomUUID } from "node:crypto"
import {
  NEXUM_DEFAULT_ROLE_PROMPT,
  NexumModelConfigError,
  NexumPermissionPolicyError,
  NexumRolePromptError,
  nexumAnyToolAction,
  normalizeMcpServerConfig,
  redactNexumSensitiveText,
  type MemoryItem,
  type MemoryPort,
  type McpCredentialStore,
  type McpOAuthCredential,
  type McpServerConfig,
  type McpServerConfigStore,
  type MessageStore,
  type ModelMessage,
  type NexumInteractionRecord,
  type NexumInteractionStore,
  type NexumModelConfig,
  type NexumModelConfigInput,
  type NexumModelConfigStore,
  type NexumPermissionPolicyEffect,
  type NexumPermissionPolicyRule,
  type NexumPermissionPolicyRuleInput,
  type NexumPermissionPolicyScope,
  type NexumPermissionPolicyStore,
  type NexumRolePrompt,
  type NexumRolePromptStore,
  type NexumSkillRegistration,
  type NexumSkillRegistrationStore,
  type SessionRecord,
  type SessionStore,
} from "@nexum/core"
import type { Database } from "bun:sqlite"
import { deleteRecord, readRecord, readRecords, writeRecord } from "./records.ts"

export function createSqliteSessionStore(database: Database): SessionStore {
  return {
    async get(sessionID) {
      return readRecord<SessionRecord>(database, "session", sessionID)
    },
    async list() {
      return readRecords<SessionRecord>(database, "session").sort(sortSessions)
    },
    async save(session) {
      writeRecord(database, "session", session.sessionID, session)
    },
    async delete(sessionID) {
      deleteRecord(database, "session", sessionID)
    },
  }
}

export function createSqliteMessageStore(database: Database): MessageStore {
  return {
    async load(sessionID) {
      return readRecord<ModelMessage[]>(database, "message", sessionID) ?? []
    },
    async save(sessionID, messages) {
      writeRecord(database, "message", sessionID, messages)
    },
    async delete(sessionID) {
      deleteRecord(database, "message", sessionID)
    },
  }
}

export function createSqliteInteractionStore(database: Database): NexumInteractionStore {
  for (const record of readRecords<NexumInteractionRecord>(database, "interaction")) {
    if (record.status === "pending") {
      writeRecord(database, "interaction", record.requestID, { ...record, status: "orphaned", updatedAt: new Date().toISOString() })
    }
  }
  return {
    async list() {
      return readRecords<NexumInteractionRecord>(database, "interaction").sort(sortInteractions)
    },
    async get(requestID) {
      return readRecord<NexumInteractionRecord>(database, "interaction", requestID)
    },
    async save(record) {
      writeRecord(database, "interaction", record.requestID, redactInteractionRecord(record))
    },
    async delete(requestID) {
      deleteRecord(database, "interaction", requestID)
    },
    async deleteSession(sessionID) {
      const records = readRecords<NexumInteractionRecord>(database, "interaction")
      records.filter((record) => record.sessionID === sessionID).forEach((record) => deleteRecord(database, "interaction", record.requestID))
    },
  }
}

export function createSqliteModelConfigStore(database: Database): NexumModelConfigStore {
  return {
    async get() {
      const active = readRecord<ActiveModelConfig>(database, "model-config", "active")
      return active ? { ...active.safe } : undefined
    },
    async update(input) {
      const active = createActiveModelConfig(input)
      writeRecord(database, "model-config", "active", active)
      return { ...active.safe }
    },
    async resolveCredential() {
      const active = readRecord<ActiveModelConfig>(database, "model-config", "active")
      if (active?.credential !== undefined) return active.credential
      if (active?.credentialRef !== undefined) return process.env[active.credentialRef]
      return undefined
    },
  }
}

export function createSqliteRolePromptStore(database: Database): NexumRolePromptStore {
  return {
    async get() {
      return readRecord<NexumRolePrompt>(database, "role-prompt", "active") ?? { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
    },
    async update(prompt) {
      if (!prompt.trim()) throw new NexumRolePromptError("invalid_prompt", "默认角色提示词不能为空")
      if (prompt.length > 32_000) throw new NexumRolePromptError("invalid_prompt", "默认角色提示词不能超过 32000 个字符")
      const next: NexumRolePrompt = { prompt, source: "custom", updatedAt: new Date().toISOString() }
      writeRecord(database, "role-prompt", "active", next)
      return next
    },
    async reset() {
      const next: NexumRolePrompt = { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
      writeRecord(database, "role-prompt", "active", next)
      return next
    },
  }
}

export function createSqlitePermissionPolicyStore(database: Database): NexumPermissionPolicyStore {
  return {
    async list(filter) {
      return readRecords<NexumPermissionPolicyRule>(database, "permission-policy").filter((rule) => !filter?.sessionID || rule.scope === "global" || rule.sessionID === filter.sessionID).sort(sortPolicyRules)
    },
    async get(ruleID) {
      return readRecord<NexumPermissionPolicyRule>(database, "permission-policy", ruleID)
    },
    async add(input) {
      const normalized = normalizePolicyInput(input)
      const rules = readRecords<NexumPermissionPolicyRule>(database, "permission-policy")
      assertNoDuplicateRule(rules, normalized)
      const timestamp = new Date().toISOString()
      const rule = { id: `hpr_${randomUUID()}`, ...normalized, createdAt: timestamp, updatedAt: timestamp }
      writeRecord(database, "permission-policy", rule.id, rule)
      return rule
    },
    async update(ruleID, input) {
      const current = readRecord<NexumPermissionPolicyRule>(database, "permission-policy", ruleID)
      if (!current) throw new NexumPermissionPolicyError("not_found", "权限策略不存在")
      const next = {
        ...current,
        ...(input.action === undefined ? {} : { action: requirePolicyAction(input.action) }),
        ...(input.resource === undefined ? {} : { resource: requirePolicyResource(input.resource) }),
        ...(input.effect === undefined ? {} : { effect: requirePolicyEffect(input.effect) }),
        updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString(),
      }
      assertNoDuplicateRule(readRecords<NexumPermissionPolicyRule>(database, "permission-policy"), next, ruleID)
      writeRecord(database, "permission-policy", ruleID, next)
      return next
    },
    async remove(ruleID) {
      const current = readRecord<NexumPermissionPolicyRule>(database, "permission-policy", ruleID)
      if (!current) throw new NexumPermissionPolicyError("not_found", "权限策略不存在")
      deleteRecord(database, "permission-policy", ruleID)
      return current
    },
  }
}

export function createSqliteMemory(database: Database): MemoryPort {
  return {
    async upsert(input) {
      const key = `${input.namespace}:${input.id}`
      const previous = readRecord<MemoryItem>(database, "memory", key)
      const next: MemoryItem = {
        ...input,
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        createdAt: input.createdAt ?? previous?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      writeRecord(database, "memory", key, next)
      return cloneMemory(next)
    },
    async search(query = {}) {
      const text = query.text?.trim().toLocaleLowerCase()
      const matches = readRecords<MemoryItem>(database, "memory")
        .filter((item) => query.namespace === undefined || item.namespace === query.namespace)
        .filter((item) => text === undefined || item.content.toLocaleLowerCase().includes(text))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      const limit = query.limit === undefined ? matches.length : Math.max(0, Math.floor(query.limit))
      return matches.slice(0, limit).map(cloneMemory)
    },
    async remove(id, namespace) {
      const items = readRecords<MemoryItem>(database, "memory")
      items.filter((item) => item.id === id && (namespace === undefined || item.namespace === namespace)).forEach((item) => deleteRecord(database, "memory", `${item.namespace}:${item.id}`))
    },
  }
}

export function createSqliteSkillRegistrationStore(database: Database): NexumSkillRegistrationStore {
  return {
    async list() {
      return readRecords<NexumSkillRegistration>(database, "skill").sort((left, right) => left.address.localeCompare(right.address))
    },
    async save(registration) {
      writeRecord(database, "skill", registration.address, registration)
    },
    async remove(address) {
      deleteRecord(database, "skill", address)
    },
  }
}

export function createSqliteMcpServerConfigStore(database: Database): McpServerConfigStore {
  return {
    async list() {
      return readRecords<McpServerConfig>(database, "mcp-config").sort((left, right) => left.id.localeCompare(right.id))
    },
    async get(serverID) {
      return readRecord<McpServerConfig>(database, "mcp-config", serverID)
    },
    async save(config) {
      const normalized = normalizeMcpServerConfig(config)
      writeRecord(database, "mcp-config", normalized.id, normalized)
    },
    async remove(serverID) {
      deleteRecord(database, "mcp-config", serverID)
    },
  }
}

export function createSqliteMcpCredentialStore(database: Database): McpCredentialStore {
  return {
    async get(serverID) {
      return readRecord<McpOAuthCredential>(database, "mcp-credential", serverID)
    },
    async save(credential) {
      if (!credential.serverID.trim() || (credential.accessToken !== undefined && !credential.accessToken.trim())) {
        throw new Error("MCP OAuth 凭据缺少 Server 或 access token")
      }
      writeRecord(database, "mcp-credential", credential.serverID, credential)
    },
    async remove(serverID) {
      deleteRecord(database, "mcp-credential", serverID)
    },
  }
}

interface ActiveModelConfig {
  readonly safe: NexumModelConfig
  readonly credential?: string
  readonly credentialRef?: string
}

function createActiveModelConfig(input: NexumModelConfigInput): ActiveModelConfig {
  let url: URL
  try {
    url = new URL(input.baseUrl.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
  } catch {
    throw new NexumModelConfigError("invalid_url", "Base URL 必须是合法的 HTTP 或 HTTPS 地址")
  }
  const model = input.model.trim()
  if (!model) throw new NexumModelConfigError("invalid_model", "模型名称不能为空")
  if (input.credential !== undefined && input.credentialRef !== undefined || input.credential !== undefined && !input.credential.trim() || input.credentialRef !== undefined && !input.credentialRef.trim() || input.credential === undefined && input.credentialRef === undefined) {
    throw new NexumModelConfigError("invalid_credential", "必须配置唯一且非空的凭据值或凭据引用")
  }
  return {
    safe: { baseUrl: url.toString().replace(/\/$/, ""), model, credentialConfigured: true, ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}) },
    ...(input.credential !== undefined ? { credential: input.credential } : {}),
    ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}),
  }
}

function normalizePolicyInput(input: NexumPermissionPolicyRuleInput) {
  const scope = requirePolicyScope(input.scope ?? "global")
  const sessionID = input.sessionID?.trim()
  if (scope === "session" && !sessionID) throw new NexumPermissionPolicyError("missing_session", "Session 作用域的策略必须指定 Session")
  return { action: requirePolicyAction(input.action), resource: requirePolicyResource(input.resource), effect: requirePolicyEffect(input.effect), scope, ...(scope === "session" ? { sessionID } : {}) }
}

function requirePolicyAction(value: string): string {
  const action = value.trim().toLowerCase()
  if (!action || action !== nexumAnyToolAction && (action.includes("*") || action.includes("?"))) throw new NexumPermissionPolicyError("invalid_rule", "策略 action 无效")
  return action
}

function requirePolicyResource(value: string): string {
  const resource = redactNexumSensitiveText(value.trim())
  if (!resource) throw new NexumPermissionPolicyError("invalid_rule", "策略 resource 不能为空")
  return resource
}

function requirePolicyEffect(value: string): NexumPermissionPolicyEffect {
  if (value !== "allow" && value !== "ask" && value !== "deny") throw new NexumPermissionPolicyError("invalid_effect", "策略效果必须是 allow、ask 或 deny")
  return value
}

function requirePolicyScope(value: string): NexumPermissionPolicyScope {
  if (value !== "global" && value !== "session") throw new NexumPermissionPolicyError("invalid_scope", "策略作用域必须是 global 或 session")
  return value
}

function assertNoDuplicateRule(rules: readonly NexumPermissionPolicyRule[], candidate: NexumPermissionPolicyRule | ReturnType<typeof normalizePolicyInput>, ignoreRuleID?: string): void {
  if (rules.some((rule) => rule.id !== ignoreRuleID && rule.action === candidate.action && rule.resource === candidate.resource && rule.effect === candidate.effect && rule.scope === candidate.scope && rule.sessionID === candidate.sessionID)) {
    throw new NexumPermissionPolicyError("duplicate_rule", "已存在相同的权限策略")
  }
}

function redactInteractionRecord(record: NexumInteractionRecord): NexumInteractionRecord {
  if (record.kind === "permission") return { ...record, resource: redactNexumSensitiveText(record.resource), ...(record.reason === undefined ? {} : { reason: redactNexumSensitiveText(record.reason) }) }
  return { ...record, questions: record.questions.map((item) => ({ ...item, options: item.options.map((option) => ({ ...option, label: redactNexumSensitiveText(option.label), description: redactNexumSensitiveText(option.description) })) })) }
}

function sortSessions(left: SessionRecord, right: SessionRecord): number {
  return right.updatedAt.localeCompare(left.updatedAt) || left.sessionID.localeCompare(right.sessionID)
}

function sortInteractions(left: NexumInteractionRecord, right: NexumInteractionRecord): number {
  return left.createdAt.localeCompare(right.createdAt) || left.requestID.localeCompare(right.requestID)
}

function sortPolicyRules(left: NexumPermissionPolicyRule, right: NexumPermissionPolicyRule): number {
  return left.scope.localeCompare(right.scope) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

function cloneMemory(item: MemoryItem): MemoryItem {
  return { ...item, ...(item.metadata ? { metadata: { ...item.metadata } } : {}) }
}
