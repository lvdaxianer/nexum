/**
 * Nexum Session canonical 消息历史的可替换持久化实现。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { ModelMessage, ModelToolCall } from "@nexum/core"
import { NexumMessageStoreError } from "@nexum/core"

/** 按 Session 保存 canonical ModelMessage 历史的可替换端口。 */
export interface MessageStore {
  readonly load: (sessionID: string) => Promise<readonly ModelMessage[]>
  readonly save: (sessionID: string, messages: readonly ModelMessage[]) => Promise<void>
}

/** 可供测试和 POC 使用的内存 MessageStore。 */
export interface InMemoryMessageStore extends MessageStore {}

export { NexumMessageStoreError }
export type { NexumMessageStoreErrorCode } from "@nexum/core"

/**
 * 创建进程内 MessageStore。
 *
 * @returns 可读写的内存 MessageStore
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function createInMemoryMessageStore(): InMemoryMessageStore {
  const sessions = new Map<string, readonly ModelMessage[]>()

  return {
    async load(sessionID) {
      return copyMessages(sessions.get(sessionID) ?? [])
    },
    async save(sessionID, messages) {
      sessions.set(sessionID, copyMessages(messages))
    },
  }
}

/** JSON 文件 MessageStore 的配置。 */
export interface FileMessageStoreOptions {
  readonly filePath: string
}

interface StoredMessageFile {
  readonly version: number
  readonly sessions: Readonly<Record<string, readonly ModelMessage[]>>
}

/**
 * 创建基于 JSON 文件的 MessageStore。
 *
 * 写入使用同目录临时文件加 rename 的原子替换，并按调用顺序串行化；
 * 文件损坏时读取与写入都会返回稳定错误，且不会覆盖原文件。
 *
 * @param options - 消息历史文件路径
 * @returns 持久化 canonical 消息历史的 MessageStore
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function createFileMessageStore(options: FileMessageStoreOptions): MessageStore {
  let loaded: Promise<Map<string, readonly ModelMessage[]>> | undefined
  let writeQueue: Promise<void> = Promise.resolve()

  async function load(): Promise<Map<string, readonly ModelMessage[]>> {
    if (!loaded) {
      loaded = readMessageFile(options.filePath).catch((error: unknown) => {
        loaded = undefined
        throw error
      })
    }
    return loaded
  }

  return {
    async load(sessionID) {
      return copyMessages((await load()).get(sessionID) ?? [])
    },
    async save(sessionID, messages) {
      const next = copyMessages(messages)
      const operation = writeQueue.then(async () => {
        const sessions = new Map(await load())
        sessions.set(sessionID, next)
        await persistMessageFile(options.filePath, sessions)
        loaded = Promise.resolve(sessions)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  }
}

async function readMessageFile(filePath: string): Promise<Map<string, readonly ModelMessage[]>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw new NexumMessageStoreError("corrupt_file", "消息历史文件不可读")
  })
  if (text === undefined) return new Map()

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new NexumMessageStoreError("corrupt_file", "消息历史文件格式无效")
  }
  if (!isStoredMessageFile(payload)) {
    throw new NexumMessageStoreError("corrupt_file", "消息历史文件格式无效")
  }

  const sessions = new Map<string, readonly ModelMessage[]>()
  for (const [sessionID, messages] of Object.entries(payload.sessions)) {
    if (!Array.isArray(messages) || !messages.every(isModelMessage)) {
      throw new NexumMessageStoreError("corrupt_file", "消息历史记录格式无效")
    }
    sessions.set(sessionID, copyMessages(messages))
  }
  return sessions
}

async function persistMessageFile(
  filePath: string,
  sessions: Map<string, readonly ModelMessage[]>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload = JSON.stringify({ version: 1, sessions: toStoredSessions(sessions) }, null, 2)
  try {
    await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 })
    await rename(temporaryPath, filePath)
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new NexumMessageStoreError("write_failed", "消息历史写入失败")
  }
}

function toStoredSessions(sessions: Map<string, readonly ModelMessage[]>): Record<string, readonly ModelMessage[]> {
  const stored: Record<string, readonly ModelMessage[]> = {}
  for (const sessionID of Array.from(sessions.keys()).sort()) {
    stored[sessionID] = sessions.get(sessionID) ?? []
  }
  return stored
}

function copyMessages(messages: readonly ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || !message.toolCalls) return { ...message }
    return { ...message, toolCalls: message.toolCalls.map((toolCall) => ({ ...toolCall })) }
  })
}

function isStoredMessageFile(value: unknown): value is StoredMessageFile {
  return isRecord(value) && typeof value.version === "number" && isRecord(value.sessions)
}

function isModelMessage(value: unknown): value is ModelMessage {
  if (!isRecord(value)) return false
  if (value.role === "system" || value.role === "user") return typeof value.content === "string"
  if (value.role === "tool") return typeof value.toolCallID === "string" && typeof value.content === "string"
  if (value.role !== "assistant") return false
  if (value.content !== undefined && typeof value.content !== "string") return false
  if (value.reasoningContent !== undefined && typeof value.reasoningContent !== "string") return false
  if (value.toolCalls === undefined) return true
  return Array.isArray(value.toolCalls) && value.toolCalls.every(isModelToolCall)
}

function isModelToolCall(value: unknown): value is ModelToolCall {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isRecord(value.input)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
