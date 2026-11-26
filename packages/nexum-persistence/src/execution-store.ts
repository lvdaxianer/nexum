/** Nexum Coding Loop 执行声明的内存与 JSON 文件存储。 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { NexumExecutionRecord, NexumExecutionStore } from "@nexum/core"

export class NexumExecutionStoreError extends Error {
  constructor(
    readonly code: "not_found" | "invalid",
    message: string,
  ) {
    super(message)
    this.name = "NexumExecutionStoreError"
  }
}

export function createInMemoryExecutionStore(): NexumExecutionStore {
  const records = new Map<string, NexumExecutionRecord>()
  return createExecutionStore({
    async read() {
      return new Map(records)
    },
    async write(next) {
      records.clear()
      next.forEach((record, executionID) => records.set(executionID, record))
    },
  })
}

export interface FileExecutionStoreOptions {
  readonly filePath: string
}

export function createFileExecutionStore(options: FileExecutionStoreOptions): NexumExecutionStore {
  let loaded: Promise<Map<string, NexumExecutionRecord>> | undefined
  let writeQueue = Promise.resolve()

  const read = async () => {
    if (!loaded) loaded = readExecutionFile(options.filePath)
    return loaded
  }
  const write = async (next: Map<string, NexumExecutionRecord>) => {
    const operation = writeQueue.then(async () => {
      await persistExecutionFile(options.filePath, next)
      loaded = Promise.resolve(new Map(next))
    })
    writeQueue = operation.then(() => undefined, () => undefined)
    await operation
  }
  return createExecutionStore({ read, write })
}

function createExecutionStore(options: {
  readonly read: () => Promise<Map<string, NexumExecutionRecord>>
  readonly write: (records: Map<string, NexumExecutionRecord>) => Promise<void>
}): NexumExecutionStore {
  return {
    async list() {
      return Array.from(await options.read(), ([, record]) => ({ ...record })).sort((left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) || left.executionID.localeCompare(right.executionID),
      )
    },
    async get(executionID) {
      const record = (await options.read()).get(executionID)
      return record ? { ...record } : undefined
    },
    async claim(input) {
      const records = await options.read()
      const current = records.get(input.executionID)
      const timestamp = new Date().toISOString()
      const record: NexumExecutionRecord = current
        ? {
            ...current,
            sessionID: input.sessionID,
            mode: input.mode,
            status: "running",
            attempt: current.attempt + 1,
            maxAttempts: input.maxAttempts,
            recoverable: true,
            updatedAt: timestamp,
            errorCode: undefined,
          }
        : {
            executionID: input.executionID || randomUUID(),
            sessionID: input.sessionID,
            mode: input.mode,
            status: "running",
            attempt: 1,
            maxAttempts: input.maxAttempts,
            recoverable: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
      records.set(record.executionID, record)
      await options.write(records)
      return { ...record }
    },
    async settle(executionID, status, errorCode) {
      const records = await options.read()
      const current = records.get(executionID)
      if (!current) throw new NexumExecutionStoreError("not_found", "执行声明不存在")
      const record: NexumExecutionRecord = {
        ...current,
        status,
        recoverable: status === "recovery_waiting",
        updatedAt: new Date().toISOString(),
        ...(errorCode ? { errorCode } : {}),
      }
      records.set(executionID, record)
      await options.write(records)
      return { ...record }
    },
    async deleteSession(sessionID) {
      const records = await options.read()
      Array.from(records.entries())
        .filter(([, record]) => record.sessionID === sessionID)
        .forEach(([executionID]) => records.delete(executionID))
      await options.write(records)
    },
  }
}

interface StoredExecutionFile {
  readonly version: 1
  readonly executions: readonly NexumExecutionRecord[]
}

async function readExecutionFile(filePath: string): Promise<Map<string, NexumExecutionRecord>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return new Map()
  const payload = JSON.parse(text) as unknown
  if (!isStoredExecutionFile(payload)) throw new NexumExecutionStoreError("invalid", "执行声明文件格式无效")
  return new Map(
    payload.executions.map((record) => [
      record.executionID,
      { ...record, recoverable: record.recoverable ?? (record.status === "running" || record.status === "recovery_waiting") },
    ]),
  )
}

async function persistExecutionFile(filePath: string, records: Map<string, NexumExecutionRecord>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredExecutionFile = { version: 1, executions: Array.from(records.values()) }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function isStoredExecutionFile(value: unknown): value is StoredExecutionFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && Array.isArray(record.executions)
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
