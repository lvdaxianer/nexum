/** MCP 配置与 OAuth 凭据的隔离持久化实现。 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  normalizeMcpServerConfig,
  type McpCredentialStore,
  type McpOAuthCredential,
  type McpServerConfig,
  type McpServerConfigStore,
} from "@nexum/core"

export interface FileMcpServerConfigStoreOptions {
  readonly filePath: string
}

export interface FileMcpCredentialStoreOptions {
  readonly filePath: string
}

export type McpStoreErrorCode = "invalid_file" | "invalid_credential"

/** MCP 文件 Store 的稳定错误。 */
export class McpStoreError extends Error {
  constructor(readonly code: McpStoreErrorCode, message: string) {
    super(message)
    this.name = "McpStoreError"
  }
}

interface StoredConfigFile {
  readonly version: 1
  readonly servers: readonly McpServerConfig[]
}

interface StoredCredentialFile {
  readonly version: 1
  readonly credentials: readonly McpOAuthCredential[]
}

/** 创建进程内 MCP Server 配置 Store。 */
export function createInMemoryMcpServerConfigStore(): McpServerConfigStore {
  const configs = new Map<string, McpServerConfig>()
  return {
    async list() {
      return [...configs.values()].sort((left, right) => left.id.localeCompare(right.id)).map(cloneConfig)
    },
    async get(serverID) {
      const config = configs.get(serverID)
      return config ? cloneConfig(config) : undefined
    },
    async save(config) {
      const normalized = normalizeMcpServerConfig(config)
      configs.set(normalized.id, cloneConfig(normalized))
    },
    async remove(serverID) {
      configs.delete(serverID)
    },
  }
}

/** 创建进程内 OAuth 凭据 Store。 */
export function createInMemoryMcpCredentialStore(): McpCredentialStore {
  const credentials = new Map<string, McpOAuthCredential>()
  return {
    async get(serverID) {
      const credential = credentials.get(serverID)
      return credential ? cloneCredential(credential) : undefined
    },
    async save(credential) {
      validateCredential(credential)
      credentials.set(credential.serverID, cloneCredential(credential))
    },
    async remove(serverID) {
      credentials.delete(serverID)
    },
  }
}

/** 创建以 JSON 文件持久化的 MCP Server 配置 Store。 */
export function createFileMcpServerConfigStore(options: FileMcpServerConfigStoreOptions): McpServerConfigStore {
  const configs = new Map<string, McpServerConfig>()
  let loaded: Promise<void> | undefined
  let writeQueue = Promise.resolve()

  async function load(): Promise<void> {
    if (!loaded) {
      loaded = readConfigFile(options.filePath).then((items) => {
        items.forEach((config) => configs.set(config.id, config))
      })
    }
    await loaded
  }

  return {
    async list() {
      await load()
      return [...configs.values()].sort((left, right) => left.id.localeCompare(right.id)).map(cloneConfig)
    },
    async get(serverID) {
      await load()
      const config = configs.get(serverID)
      return config ? cloneConfig(config) : undefined
    },
    async save(config) {
      const normalized = normalizeMcpServerConfig(config)
      await load()
      const next = cloneConfig(normalized)
      const operation = writeQueue.then(async () => {
        const updated = new Map(configs)
        updated.set(next.id, next)
        await persistConfigFile(options.filePath, [...updated.values()])
        configs.clear()
        updated.forEach((value, key) => configs.set(key, value))
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    async remove(serverID) {
      await load()
      const operation = writeQueue.then(async () => {
        const updated = new Map(configs)
        updated.delete(serverID)
        await persistConfigFile(options.filePath, [...updated.values()])
        configs.clear()
        updated.forEach((value, key) => configs.set(key, value))
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  }
}

/** 创建以 `0600` JSON 文件隔离持久化的 OAuth 凭据 Store。 */
export function createFileMcpCredentialStore(options: FileMcpCredentialStoreOptions): McpCredentialStore {
  const credentials = new Map<string, McpOAuthCredential>()
  let loaded: Promise<void> | undefined
  let writeQueue = Promise.resolve()

  async function load(): Promise<void> {
    if (!loaded) {
      loaded = readCredentialFile(options.filePath).then((items) => {
        items.forEach((credential) => credentials.set(credential.serverID, credential))
      })
    }
    await loaded
  }

  return {
    async get(serverID) {
      await load()
      const credential = credentials.get(serverID)
      return credential ? cloneCredential(credential) : undefined
    },
    async save(credential) {
      validateCredential(credential)
      await load()
      const next = cloneCredential(credential)
      const operation = writeQueue.then(async () => {
        const updated = new Map(credentials)
        updated.set(next.serverID, next)
        await persistCredentialFile(options.filePath, [...updated.values()])
        credentials.clear()
        updated.forEach((value, key) => credentials.set(key, value))
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    async remove(serverID) {
      await load()
      const operation = writeQueue.then(async () => {
        const updated = new Map(credentials)
        updated.delete(serverID)
        await persistCredentialFile(options.filePath, [...updated.values()])
        credentials.clear()
        updated.forEach((value, key) => credentials.set(key, value))
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  }
}

async function readConfigFile(filePath: string): Promise<readonly McpServerConfig[]> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return []
  const value = parseJson(text)
  if (!isStoredConfigFile(value)) throw new McpStoreError("invalid_file", "MCP 配置文件格式无效")
  return value.servers.map(normalizeMcpServerConfig)
}

async function readCredentialFile(filePath: string): Promise<readonly McpOAuthCredential[]> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return []
  const value = parseJson(text)
  if (!isStoredCredentialFile(value)) throw new McpStoreError("invalid_file", "MCP 凭据文件格式无效")
  value.credentials.forEach(validateCredential)
  return value.credentials.map(cloneCredential)
}

async function persistConfigFile(filePath: string, servers: readonly McpServerConfig[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredConfigFile = { version: 1, servers: servers.map(cloneConfig) }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

async function persistCredentialFile(filePath: string, credentials: readonly McpOAuthCredential[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredCredentialFile = { version: 1, credentials: credentials.map(cloneCredential) }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function validateCredential(credential: McpOAuthCredential): void {
  if (!credential.serverID.trim() || (credential.accessToken !== undefined && !credential.accessToken.trim())) {
    throw new McpStoreError("invalid_credential", "MCP OAuth 凭据缺少 Server 或 access token")
  }
  if (credential.accessToken === undefined && !credential.clientId?.trim()) {
    throw new McpStoreError("invalid_credential", "MCP OAuth 凭据缺少 access token 或 client id")
  }
  if (credential.expiresAt !== undefined && (!Number.isFinite(credential.expiresAt) || credential.expiresAt <= 0)) {
    throw new McpStoreError("invalid_credential", "MCP OAuth 凭据 expiresAt 无效")
  }
}

function cloneConfig(config: McpServerConfig): McpServerConfig {
  return { ...config, ...(config.headers ? { headers: { ...config.headers } } : {}) }
}

function cloneCredential(credential: McpOAuthCredential): McpOAuthCredential {
  return { ...credential }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new McpStoreError("invalid_file", "MCP 持久化文件格式无效")
  }
}

function isStoredConfigFile(value: unknown): value is StoredConfigFile {
  return isRecord(value) && value.version === 1 && Array.isArray(value.servers) && value.servers.every(isMcpServerConfig)
}

function isStoredCredentialFile(value: unknown): value is StoredCredentialFile {
  return isRecord(value) && value.version === 1 && Array.isArray(value.credentials) && value.credentials.every(isMcpOAuthCredential)
}

function isMcpServerConfig(value: unknown): value is McpServerConfig {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    (value.headers === undefined || isRecordOfStrings(value.headers)) &&
    (value.disabled === undefined || typeof value.disabled === "boolean") &&
    (value.timeoutMs === undefined || typeof value.timeoutMs === "number") &&
    (value.protocol === undefined || value.protocol === "legacy" || value.protocol === "auto" || value.protocol === "2026-07-28")
  )
}

function isMcpOAuthCredential(value: unknown): value is McpOAuthCredential {
  return (
    isRecord(value) &&
    typeof value.serverID === "string" &&
    typeof value.accessToken === "string" &&
    (value.refreshToken === undefined || typeof value.refreshToken === "string") &&
    (value.expiresAt === undefined || typeof value.expiresAt === "number") &&
    (value.tokenType === undefined || typeof value.tokenType === "string") &&
    (value.scope === undefined || typeof value.scope === "string") &&
    (value.resource === undefined || typeof value.resource === "string") &&
    (value.clientId === undefined || typeof value.clientId === "string") &&
    (value.clientSecret === undefined || typeof value.clientSecret === "string") &&
    (value.issuer === undefined || typeof value.issuer === "string")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string")
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
