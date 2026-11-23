/**
 * Nexum Memory 的最小可替换端口与进程内默认实现。
 */

import type { MemoryItem, MemoryPort } from "@nexum/core"

export interface InMemoryMemoryOptions {
  readonly now?: () => string
}

export function createInMemoryMemory(options: InMemoryMemoryOptions = {}): MemoryPort {
  const items = new Map<string, MemoryItem>()
  const now = options.now ?? (() => new Date().toISOString())

  return {
    async upsert(input) {
      const key = memoryKey(input.namespace, input.id)
      const previous = items.get(key)
      const timestamp = now()
      const item: MemoryItem = {
        ...input,
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        createdAt: input.createdAt ?? previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      items.set(key, item)
      return { ...item, metadata: item.metadata ? { ...item.metadata } : undefined }
    },
    async search(query = {}) {
      const text = query.text?.trim().toLocaleLowerCase()
      const matches = Array.from(items.values())
        .filter((item) => query.namespace === undefined || item.namespace === query.namespace)
        .filter((item) => text === undefined || item.content.toLocaleLowerCase().includes(text))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      const limit = query.limit === undefined ? matches.length : Math.max(0, Math.floor(query.limit))
      return matches.slice(0, limit).map((item) => ({ ...item, metadata: item.metadata ? { ...item.metadata } : undefined }))
    },
    async remove(id, namespace) {
      if (namespace !== undefined) {
        items.delete(memoryKey(namespace, id))
        return
      }
      for (const key of items.keys()) if (key.endsWith(`:${id}`)) items.delete(key)
    },
  }
}

function memoryKey(namespace: string, id: string): string {
  return `${namespace}:${id}`
}
