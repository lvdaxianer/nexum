/** Nexum Core 的 Memory 端口。 */

export interface MemoryItem {
  readonly id: string
  readonly namespace: string
  readonly content: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MemoryQuery {
  readonly namespace?: string
  readonly text?: string
  readonly limit?: number
}

export interface MemoryPort {
  readonly upsert: (item: Omit<MemoryItem, "createdAt" | "updatedAt"> & Partial<Pick<MemoryItem, "createdAt" | "updatedAt">>) => Promise<MemoryItem>
  readonly search: (query?: MemoryQuery) => Promise<readonly MemoryItem[]>
  readonly remove: (id: string, namespace?: string) => Promise<void>
}
