/** Nexum 默认角色提示词的内存与文件存储。 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  NEXUM_DEFAULT_ROLE_PROMPT,
  NexumRolePromptError,
  type NexumRolePrompt,
  type NexumRolePromptStore,
} from "@nexum/core"

const MAX_ROLE_PROMPT_LENGTH = 32_000

export interface FileRolePromptStoreOptions {
  readonly filePath: string
}

interface StoredRolePrompt {
  readonly version: 1
  readonly prompt: string
  readonly source: "default" | "custom"
  readonly updatedAt: string
}

export function createNexumRolePromptStore(): NexumRolePromptStore {
  let active: NexumRolePrompt = { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }

  return {
    async get() {
      return { ...active }
    },
    async update(prompt) {
      active = createCustomRolePrompt(prompt)
      return { ...active }
    },
    async reset() {
      active = { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
      return { ...active }
    },
  }
}

export function createFileRolePromptStore(options: FileRolePromptStoreOptions): NexumRolePromptStore {
  let active: NexumRolePrompt = { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
  let loaded: Promise<void> | undefined
  let writeQueue = Promise.resolve()

  async function load(): Promise<void> {
    if (!loaded) {
      loaded = readRolePrompt(options.filePath).then((value) => {
        active = value ?? { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
      })
    }
    await loaded
  }

  const persist = (next: NexumRolePrompt): Promise<void> => {
    const operation = writeQueue.then(() => persistRolePrompt(options.filePath, next))
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  return {
    async get() {
      await load()
      return { ...active }
    },
    async update(prompt) {
      await load()
      const next = createCustomRolePrompt(prompt)
      await persist(next)
      active = next
      return { ...next }
    },
    async reset() {
      await load()
      const next: NexumRolePrompt = { prompt: NEXUM_DEFAULT_ROLE_PROMPT, source: "default" }
      await persist(next)
      active = next
      return { ...next }
    },
  }
}

function createCustomRolePrompt(prompt: string): NexumRolePrompt {
  if (!prompt.trim()) throw new NexumRolePromptError("invalid_prompt", "默认角色提示词不能为空")
  if (prompt.length > MAX_ROLE_PROMPT_LENGTH) {
    throw new NexumRolePromptError("invalid_prompt", `默认角色提示词不能超过 ${MAX_ROLE_PROMPT_LENGTH} 个字符`)
  }
  return { prompt, source: "custom", updatedAt: new Date().toISOString() }
}

async function readRolePrompt(filePath: string): Promise<NexumRolePrompt | undefined> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return undefined
  const value = JSON.parse(text) as unknown
  if (!isStoredRolePrompt(value)) throw new Error("角色提示词文件格式无效")
  return {
    prompt: value.prompt,
    source: value.source,
    updatedAt: value.updatedAt,
  }
}

async function persistRolePrompt(filePath: string, value: NexumRolePrompt): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredRolePrompt = {
    version: 1,
    prompt: value.prompt,
    source: value.source,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
  }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function isStoredRolePrompt(value: unknown): value is StoredRolePrompt {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.prompt === "string" &&
    (value.source === "default" || value.source === "custom") &&
    typeof value.updatedAt === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
