/**
 * Nexum 权限与 Question 交互请求的持久化 Store。
 *
 * Store 只保存可对外展示的请求摘要，用于服务重启后把失去等待者的交互标记为
 * `orphaned`。它不保存可继续执行的调用栈，也不伪造运行恢复；原请求 ID 在重启后
 * 只能被查询和清理，不能再次成功回复。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { NexumQuestionItem } from "@nexum/core"
import { NexumInteractionStoreError, redactNexumSensitiveText } from "@nexum/core"

const interactionStatuses = ["pending", "orphaned"] as const

/** 交互请求所属能力。 */
export type NexumInteractionKind = "permission" | "question"

/**
 * 交互请求的生命周期状态。
 *
 * - `pending`：当前进程内存在等待者，可以查询、回复和取消。
 * - `orphaned`：等待者已随进程退出，只能查询和清理，不能回复。
 */
export type NexumInteractionStatus = (typeof interactionStatuses)[number]

interface InteractionIdentity {
  readonly requestID: string
  readonly sessionID: string
  readonly status: NexumInteractionStatus
  readonly createdAt: string
  readonly updatedAt: string
}

/** 一条已持久化的交互请求摘要。 */
export type NexumInteractionRecord =
  | (InteractionIdentity & {
      readonly kind: "permission"
      readonly action: string
      readonly resource: string
      readonly reason?: string
    })
  | (InteractionIdentity & {
      readonly kind: "question"
      readonly toolCallID: string
      readonly questions: readonly NexumQuestionItem[]
    })

/** 交互请求持久化端口。 */
export interface NexumInteractionStore {
  /**
   * 列出全部已持久化交互。
   *
   * 文件 Store 在首次读取时把遗留的 `pending` 视为孤儿，标记为 `orphaned` 并落盘。
   */
  readonly list: () => Promise<readonly NexumInteractionRecord[]>
  readonly get: (requestID: string) => Promise<NexumInteractionRecord | undefined>
  readonly save: (record: NexumInteractionRecord) => Promise<void>
  readonly delete: (requestID: string) => Promise<void>
  readonly deleteSession: (sessionID: string) => Promise<void>
}

export { NexumInteractionStoreError }
export type { NexumInteractionStoreErrorCode } from "@nexum/core"

/** 文件交互 Store 配置。 */
export interface FileInteractionStoreOptions {
  readonly filePath: string
}

interface StoredInteractionFile {
  readonly version: number
  readonly interactions: readonly unknown[]
}

interface ReadInteractionResult {
  readonly records: Map<string, NexumInteractionRecord>
  readonly orphaned: number
}

/**
 * 创建基于 JSON 文件的交互请求 Store。
 *
 * 写入使用临时文件 + rename 保证原子性，同一实例内的读写按提交顺序串行执行；
 * 文件不可解析时抛出稳定的 `invalid_file` 错误且不覆盖原文件。
 *
 * @param options - 交互记录文件路径
 * @returns 可持久化权限与 Question 请求的 Store
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
export function createFileInteractionStore(options: FileInteractionStoreOptions): NexumInteractionStore {
  let loaded: Promise<Map<string, NexumInteractionRecord>> | undefined
  let writeQueue = Promise.resolve()

  const load = async (): Promise<Map<string, NexumInteractionRecord>> => {
    if (!loaded) {
      loaded = readInteractions(options.filePath).then(async (result) => {
        // 上一个进程留下的 pending 已经没有等待者，恢复为 orphaned 并立刻落盘。
        if (result.orphaned > 0) await persistInteractions(options.filePath, result.records)
        return result.records
      })
    }
    return loaded
  }

  const write = async (mutate: (records: Map<string, NexumInteractionRecord>) => void): Promise<void> => {
    const operation = writeQueue.then(async () => {
      const next = new Map(await load())
      mutate(next)
      await persistInteractions(options.filePath, next)
      loaded = Promise.resolve(next)
    })
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    await operation
  }

  return {
    async list() {
      return sortInteractions(Array.from((await load()).values()))
    },
    async get(requestID) {
      return (await load()).get(requestID)
    },
    async save(record) {
      await write((records) => records.set(record.requestID, redactInteractionRecord(record)))
    },
    async delete(requestID) {
      await write((records) => records.delete(requestID))
    },
    async deleteSession(sessionID) {
      await write((records) => {
        for (const [requestID, record] of records) {
          if (record.sessionID === sessionID) records.delete(requestID)
        }
      })
    },
  }
}

async function readInteractions(filePath: string): Promise<ReadInteractionResult> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return { records: new Map(), orphaned: 0 }
  const payload = parseInteractionFile(text)
  const fallbackTime = new Date().toISOString()
  const records = payload.interactions.map((value) => recoverInteraction(parseInteraction(value, fallbackTime), fallbackTime))
  return {
    records: new Map(records.map((record) => [record.requestID, record])),
    orphaned: records.filter((record) => record.status === "orphaned").length,
  }
}

async function persistInteractions(
  filePath: string,
  records: Map<string, NexumInteractionRecord>,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload = JSON.stringify({ version: 1, interactions: sortInteractions(Array.from(records.values())) }, null, 2)
  await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function parseInteractionFile(text: string): StoredInteractionFile {
  const payload = parseJson(text)
  if (!isRecord(payload) || typeof payload.version !== "number" || !Array.isArray(payload.interactions)) {
    throw invalidInteractionFile()
  }
  return { version: payload.version, interactions: payload.interactions }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw invalidInteractionFile()
  }
}

function parseInteraction(value: unknown, fallbackTime: string): NexumInteractionRecord {
  if (!isRecord(value)) throw invalidInteractionFile()
  if (typeof value.requestID !== "string" || value.requestID === "") throw invalidInteractionFile()
  if (typeof value.sessionID !== "string" || value.sessionID === "") throw invalidInteractionFile()
  if (typeof value.status !== "string" || !isInteractionStatus(value.status)) throw invalidInteractionFile()
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : fallbackTime
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt
  const identity = {
    requestID: value.requestID,
    sessionID: value.sessionID,
    status: value.status,
    createdAt,
    updatedAt,
  }
  if (value.kind === "permission") {
    if (typeof value.action !== "string" || typeof value.resource !== "string") throw invalidInteractionFile()
    if (value.reason !== undefined && typeof value.reason !== "string") throw invalidInteractionFile()
    return {
      ...identity,
      kind: "permission",
      action: value.action,
      resource: value.resource,
      ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    }
  }
  if (value.kind === "question") {
    if (typeof value.toolCallID !== "string" || !Array.isArray(value.questions)) throw invalidInteractionFile()
    const questions = value.questions.map((item) => parseQuestionItem(item))
    return { ...identity, kind: "question", toolCallID: value.toolCallID, questions }
  }
  throw invalidInteractionFile()
}

function parseQuestionItem(value: unknown): NexumQuestionItem {
  if (!isRecord(value) || typeof value.header !== "string" || typeof value.question !== "string") {
    throw invalidInteractionFile()
  }
  if (!Array.isArray(value.options)) throw invalidInteractionFile()
  return {
    header: value.header,
    question: value.question,
    options: value.options.map((option) => {
      if (!isRecord(option) || typeof option.label !== "string" || typeof option.description !== "string") {
        throw invalidInteractionFile()
      }
      return { label: option.label, description: option.description }
    }),
    ...(typeof value.multiple === "boolean" ? { multiple: value.multiple } : {}),
  }
}

/** 把重启后遗留的 pending 标记为 orphaned，保留原始请求时间戳。 */
function recoverInteraction(record: NexumInteractionRecord, recoveredAt: string): NexumInteractionRecord {
  if (record.status !== "pending") return record
  return { ...record, status: "orphaned", updatedAt: recoveredAt }
}

/** 只保留当前环境已定义的字段，并在落盘前统一脱敏。 */
function redactInteractionRecord(record: NexumInteractionRecord): NexumInteractionRecord {
  if (record.kind === "permission") {
    return {
      ...record,
      resource: redactNexumSensitiveText(record.resource),
      ...(record.reason === undefined ? {} : { reason: redactNexumSensitiveText(record.reason) }),
    }
  }
  return {
    ...record,
    questions: record.questions.map((item) => ({
      header: item.header,
      question: item.question,
      options: item.options.map((option) => ({
        label: redactNexumSensitiveText(option.label),
        description: redactNexumSensitiveText(option.description),
      })),
      ...(item.multiple === undefined ? {} : { multiple: item.multiple }),
    })),
  }
}

function sortInteractions(records: NexumInteractionRecord[]): NexumInteractionRecord[] {
  return records.sort((left, right) => {
    const created = left.createdAt.localeCompare(right.createdAt)
    if (created !== 0) return created
    return left.requestID.localeCompare(right.requestID)
  })
}

function isInteractionStatus(value: string): value is NexumInteractionStatus {
  return (interactionStatuses as readonly string[]).includes(value)
}

function invalidInteractionFile(): NexumInteractionStoreError {
  return new NexumInteractionStoreError("invalid_file", "交互记录文件格式无效")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
