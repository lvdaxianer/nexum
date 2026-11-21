/**
 * Headless Core 的单模型运行时配置存储。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

/** 模型配置输入，凭据可以直接传值或引用环境变量名。 */
export interface HeadlessModelConfigInput {
  readonly baseUrl: string
  readonly model: string
  readonly credential?: string
  readonly credentialRef?: string
}

/** 对外安全返回的模型配置。 */
export interface HeadlessModelConfig {
  readonly baseUrl: string
  readonly model: string
  readonly credentialConfigured: boolean
  readonly credentialRef?: string
}

/** 模型配置存储端口。 */
export interface HeadlessModelConfigStore {
  readonly get: () => Promise<HeadlessModelConfig | undefined>
  readonly update: (input: HeadlessModelConfigInput) => Promise<HeadlessModelConfig>
  readonly resolveCredential: () => Promise<string | undefined>
}

export interface FileModelConfigStoreOptions {
  readonly filePath: string
}

/** 模型配置领域错误码。 */
export type HeadlessModelConfigErrorCode = "invalid_url" | "invalid_model" | "invalid_credential"

/** 模型配置校验错误。 */
export class HeadlessModelConfigError extends Error {
  constructor(
    readonly code: HeadlessModelConfigErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessModelConfigError"
  }
}

/**
 * 创建单一活动模型配置存储。
 *
 * @returns 保留最后一次有效配置且不暴露凭据值的存储端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessModelConfigStore(): HeadlessModelConfigStore {
  let active: ActiveModelConfig | undefined

  return {
    async get() {
      return active ? { ...active.safe } : undefined
    },
    async update(input) {
      active = createActiveModelConfig(input)
      return { ...active.safe }
    },
    async resolveCredential() {
      if (active?.credential !== undefined) return active.credential
      if (active?.credentialRef !== undefined) return process.env[active.credentialRef]
      return undefined
    },
  }
}

export function createFileModelConfigStore(options: FileModelConfigStoreOptions): HeadlessModelConfigStore {
  let active: ActiveModelConfig | undefined
  let loaded: Promise<void> | undefined
  let writeQueue = Promise.resolve()

  async function load(): Promise<void> {
    if (!loaded) {
      loaded = readModelConfig(options.filePath).then((value) => {
        active = value
      })
    }
    await loaded
  }

  return {
    async get() {
      await load()
      return active ? { ...active.safe } : undefined
    },
    async update(input) {
      await load()
      const next = createActiveModelConfig(input)
      const operation = writeQueue.then(async () => {
        await persistModelConfig(options.filePath, next)
        active = next
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
      return { ...next.safe }
    },
    async resolveCredential() {
      await load()
      if (active?.credential !== undefined) return active.credential
      if (active?.credentialRef !== undefined) return process.env[active.credentialRef]
      return undefined
    },
  }
}

interface ActiveModelConfig {
  readonly safe: HeadlessModelConfig
  readonly credential?: string
  readonly credentialRef?: string
}

interface StoredModelConfig {
  readonly version: 1
  readonly baseUrl: string
  readonly model: string
  readonly credential?: string
  readonly credentialRef?: string
}

function createActiveModelConfig(input: HeadlessModelConfigInput): ActiveModelConfig {
  const baseUrl = validateBaseUrl(input.baseUrl)
  const model = input.model.trim()
  if (!model) throw new HeadlessModelConfigError("invalid_model", "模型名称不能为空")
  if (input.credential !== undefined && input.credentialRef !== undefined) {
    throw new HeadlessModelConfigError("invalid_credential", "credential 与 credentialRef 只能配置一个")
  }
  if (input.credential !== undefined && !input.credential.trim()) {
    throw new HeadlessModelConfigError("invalid_credential", "credential 不能为空")
  }
  if (input.credentialRef !== undefined && !input.credentialRef.trim()) {
    throw new HeadlessModelConfigError("invalid_credential", "credentialRef 不能为空")
  }
  if (input.credential === undefined && input.credentialRef === undefined) {
    throw new HeadlessModelConfigError("invalid_credential", "必须配置凭据值或凭据引用")
  }

  return {
    safe: {
      baseUrl,
      model,
      credentialConfigured: input.credential !== undefined || input.credentialRef !== undefined,
      ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}),
    },
    ...(input.credential !== undefined ? { credential: input.credential } : {}),
    ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}),
  }
}

async function readModelConfig(filePath: string): Promise<ActiveModelConfig | undefined> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return undefined
  const value = JSON.parse(text) as unknown
  if (!isStoredModelConfig(value)) throw new Error("模型配置文件格式无效")
  return createActiveModelConfig(value)
}

async function persistModelConfig(filePath: string, active: ActiveModelConfig): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredModelConfig = {
    version: 1,
    baseUrl: active.safe.baseUrl,
    model: active.safe.model,
    ...(active.credential !== undefined ? { credential: active.credential } : {}),
    ...(active.credentialRef !== undefined ? { credentialRef: active.credentialRef } : {}),
  }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function validateBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
    if (url.username || url.password || url.search || url.hash) throw new Error()
    return url.toString().replace(/\/$/, "")
  } catch {
    throw new HeadlessModelConfigError("invalid_url", "Base URL 必须是合法的 HTTP 或 HTTPS 地址")
  }
}

function isStoredModelConfig(value: unknown): value is StoredModelConfig {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.baseUrl === "string" &&
    typeof value.model === "string" &&
    (value.credential === undefined || typeof value.credential === "string") &&
    (value.credentialRef === undefined || typeof value.credentialRef === "string")
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
