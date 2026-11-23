/**
 * Nexum Core 的单模型运行时配置存储。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { NexumModelConfigError } from "@nexum/core"
import type { NexumModelConfig, NexumModelConfigInput, NexumModelConfigStore } from "@nexum/core"

export interface FileModelConfigStoreOptions {
  readonly filePath: string
}

/**
 * 创建单一活动模型配置存储。
 *
 * @returns 保留最后一次有效配置且不暴露凭据值的存储端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createNexumModelConfigStore(): NexumModelConfigStore {
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

export function createFileModelConfigStore(options: FileModelConfigStoreOptions): NexumModelConfigStore {
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
  readonly safe: NexumModelConfig
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

function createActiveModelConfig(input: NexumModelConfigInput): ActiveModelConfig {
  const baseUrl = validateBaseUrl(input.baseUrl)
  const model = input.model.trim()
  if (!model) throw new NexumModelConfigError("invalid_model", "模型名称不能为空")
  if (input.credential !== undefined && input.credentialRef !== undefined) {
    throw new NexumModelConfigError("invalid_credential", "credential 与 credentialRef 只能配置一个")
  }
  if (input.credential !== undefined && !input.credential.trim()) {
    throw new NexumModelConfigError("invalid_credential", "credential 不能为空")
  }
  if (input.credentialRef !== undefined && !input.credentialRef.trim()) {
    throw new NexumModelConfigError("invalid_credential", "credentialRef 不能为空")
  }
  if (input.credential === undefined && input.credentialRef === undefined) {
    throw new NexumModelConfigError("invalid_credential", "必须配置凭据值或凭据引用")
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
    throw new NexumModelConfigError("invalid_url", "Base URL 必须是合法的 HTTP 或 HTTPS 地址")
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
