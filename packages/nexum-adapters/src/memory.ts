/**
 * 文件型 Memory Adapter。
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import type { MemoryItem, MemoryPort, MemoryQuery } from "@nexum/core"

export interface FileMemoryOptions {
  readonly filePath: string
}

export function createFileMemory(options: FileMemoryOptions): MemoryPort {
  let loaded: Promise<Map<string, MemoryItem>> | undefined
  let writeQueue: Promise<void> = Promise.resolve()

  async function load(): Promise<Map<string, MemoryItem>> {
    if (!loaded) {
      loaded = readFile(options.filePath, "utf8")
        .then((text) => parseMemoryFile(JSON.parse(text)))
        .catch((error: unknown) => {
          if (isMissingFile(error)) return new Map()
          throw new Error("Memory 文件格式无效")
        })
    }
    return loaded
  }

  const persist = async (items: Map<string, MemoryItem>): Promise<void> => {
    await mkdir(dirname(options.filePath), { recursive: true })
    const temporaryPath = `${options.filePath}.${randomUUID()}.tmp`
    try {
      await writeFile(temporaryPath, `${JSON.stringify({ version: 1, items: Object.fromEntries(items) }, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      })
      await rename(temporaryPath, options.filePath)
    } catch {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw new Error("Memory 文件写入失败")
    }
  }

  const update = async (mutate: (items: Map<string, MemoryItem>) => void): Promise<void> => {
    const operation = writeQueue.then(async () => {
      const items = new Map(await load())
      mutate(items)
      await persist(items)
      loaded = Promise.resolve(items)
    })
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    await operation
  }

  return {
    async upsert(input) {
      const items = await load()
      const key = `${input.namespace}:${input.id}`
      const previous = items.get(key)
      const timestamp = new Date().toISOString()
      const item: MemoryItem = {
        ...input,
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        createdAt: input.createdAt ?? previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      await update((next) => next.set(key, item))
      return cloneMemory(item)
    },
    async search(query = {}) {
      const items = await load()
      return searchMemory(items.values(), query)
    },
    async remove(id, namespace) {
      await update((items) => {
        if (namespace !== undefined) {
          items.delete(`${namespace}:${id}`)
          return
        }
        for (const key of items.keys()) if (key.endsWith(`:${id}`)) items.delete(key)
      })
    },
  }
}

function searchMemory(items: Iterable<MemoryItem>, query: MemoryQuery): readonly MemoryItem[] {
  const text = query.text?.trim().toLocaleLowerCase()
  const matches = Array.from(items)
    .filter((item) => query.namespace === undefined || item.namespace === query.namespace)
    .filter((item) => text === undefined || item.content.toLocaleLowerCase().includes(text))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
  const limit = query.limit === undefined ? matches.length : Math.max(0, Math.floor(query.limit))
  return matches.slice(0, limit).map(cloneMemory)
}

function parseMemoryFile(value: unknown): Map<string, MemoryItem> {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.items)) throw new Error("invalid memory file")
  const entries = new Map<string, MemoryItem>()
  for (const [key, item] of Object.entries(value.items)) {
    if (!isMemoryItem(item)) throw new Error("invalid memory item")
    entries.set(key, cloneMemory(item))
  }
  return entries
}

function cloneMemory(item: MemoryItem): MemoryItem {
  return { ...item, ...(item.metadata ? { metadata: { ...item.metadata } } : {}) }
}

function isMemoryItem(value: unknown): value is MemoryItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.namespace === "string" &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
