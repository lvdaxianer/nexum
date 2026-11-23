/** Nexum Session 的 JSON 文件持久化 Store。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-21
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import type { SessionRecord } from "@nexum/core"

const sessionStatuses = new Set<SessionRecord["status"]>(["idle", "running", "completed", "failed", "cancelled"])

export interface FileSessionStoreOptions {
  readonly filePath: string
}

interface StoredSessionFile {
  readonly version: number
  readonly sessions: readonly unknown[]
}

/** 创建进程内 SessionStore，供默认 Runtime 与测试使用。 */
export function createInMemorySessionStore() {
  const sessions = new Map<string, SessionRecord>()

  return {
    async get(sessionID: string) {
      const session = sessions.get(sessionID)
      return session ? { ...session } : undefined
    },
    async list() {
      return sortSessions(Array.from(sessions.values(), (session) => ({ ...session })))
    },
    async save(session: SessionRecord) {
      sessions.set(session.sessionID, { ...session })
    },
    async delete(sessionID: string) {
      sessions.delete(sessionID)
    },
  }
}

/** 创建基于 JSON 文件的 POC SessionStore。 */
export function createFileSessionStore(options: FileSessionStoreOptions) {
  let loaded: Promise<Map<string, SessionRecord>> | undefined
  let writeQueue = Promise.resolve()

  async function load(): Promise<Map<string, SessionRecord>> {
    if (!loaded) loaded = readSessions(options.filePath)
    return loaded
  }

  return {
    async get(sessionID: string) {
      const session = (await load()).get(sessionID)
      return session ? { ...session } : undefined
    },
    async list() {
      return sortSessions(Array.from((await load()).values(), (session) => ({ ...session })))
    },
    async save(session: SessionRecord) {
      const operation = writeQueue.then(async () => {
        const next = new Map(await load())
        next.set(session.sessionID, { ...session })
        await persistSessions(options.filePath, next)
        loaded = Promise.resolve(next)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    async delete(sessionID: string) {
      const operation = writeQueue.then(async () => {
        const next = new Map(await load())
        next.delete(sessionID)
        await persistSessions(options.filePath, next)
        loaded = Promise.resolve(next)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
  }
}

async function readSessions(filePath: string): Promise<Map<string, SessionRecord>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return new Map()
  const payload = JSON.parse(text) as unknown
  if (!isStoredSessionFile(payload)) throw new Error("Session 文件格式无效")
  const fallbackTime = new Date().toISOString()
  const sessions = payload.sessions.map((value) => migrateSession(value, fallbackTime))
  return new Map(sessions.map((session) => [session.sessionID, session]))
}

async function persistSessions(filePath: string, sessions: Map<string, SessionRecord>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload = JSON.stringify({ version: 1, sessions: sortSessions(Array.from(sessions.values())) }, null, 2)
  await writeFile(temporaryPath, `${payload}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function migrateSession(value: unknown, fallbackTime: string): SessionRecord {
  if (!isRecord(value)) throw new Error("Session 记录格式无效")
  if (typeof value.sessionID !== "string" || typeof value.directory !== "string") {
    throw new Error("Session 记录缺少 ID 或工作目录")
  }
  if (typeof value.status !== "string" || !sessionStatuses.has(value.status as SessionRecord["status"])) {
    throw new Error("Session 记录状态无效")
  }
  const directory = value.directory
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : basename(directory)
  if (!name) throw new Error("Session 记录名称无效")
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : fallbackTime
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt
  const status = value.status as SessionRecord["status"]
  return {
    sessionID: value.sessionID,
    name,
    directory,
    status: status === "running" ? "idle" : status,
    createdAt,
    updatedAt,
  }
}

function sortSessions(sessions: SessionRecord[]): SessionRecord[] {
  return sessions.sort((left, right) => {
    const updated = right.updatedAt.localeCompare(left.updatedAt)
    if (updated !== 0) return updated
    return left.sessionID.localeCompare(right.sessionID)
  })
}

function isStoredSessionFile(value: unknown): value is StoredSessionFile {
  return isRecord(value) && typeof value.version === "number" && Array.isArray(value.sessions)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
