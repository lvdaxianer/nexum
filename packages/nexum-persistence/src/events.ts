/**
 * Nexum Server 的进程内事件 Hub 与 SSE 订阅端口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { EventSink, RuntimeEvent } from "@nexum/core"

/** 可发布并按 Session 订阅运行事件的事件 Hub。 */
export interface NexumEventHub extends EventSink {
  readonly subscribe: (sessionID: string, options?: NexumEventSubscriptionOptions) => AsyncIterable<RuntimeEvent>
  readonly lastSequence: (sessionID: string) => number
  readonly nextSequence: (sessionID: string) => Promise<number>
  readonly delete: (sessionID: string) => Promise<void>
  /** 等待持久化事件文件首次加载完成；坏文件会以稳定错误拒绝。 */
  readonly ready?: () => Promise<void>
}

/** SSE 重连时使用的事件游标。 */
export interface NexumEventSubscriptionOptions {
  readonly afterEventID?: string
  readonly afterSequence?: number
}

/** Nexum Event Hub 的可选持久化配置。 */
export interface NexumEventHubOptions {
  /** 事件 JSON 文件路径；缺省时历史只保存在进程内。 */
  readonly filePath?: string
}

/** 事件持久化失败时抛出的稳定领域错误，消息不包含内部文件路径。 */
export class NexumEventStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NexumEventStoreError"
  }
}

/** 历史回放上限。超出后最旧的游标事件会被淘汰，只能退化为按 sequence 定位。 */
const historyLimit = 256

/** 单个订阅者用于去重的 eventID 记忆窗口。 */
const dedupeWindow = 512

/**
 * 创建进程内 Nexum Event Hub，可选注入 JSON 文件持久化。
 *
 * @param options - 事件文件路径等持久化配置
 * @returns 可供 Coding Loop 和 SSE handler 共用的事件端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createNexumEventHub(options: NexumEventHubOptions = {}): NexumEventHub {
  const filePath = options.filePath
  const subscribers = new Map<string, Set<Subscriber>>()
  let history = new Map<string, RuntimeEvent[]>()
  const reservedSequences = new Map<string, number>()
  let loaded: Promise<void> | undefined
  let writeQueue: Promise<void> = Promise.resolve()

  const load = (): Promise<void> => {
    if (loaded) return loaded
    loaded =
      filePath === undefined
        ? Promise.resolve()
        : readEventsFile(filePath).then((events) => {
            history = events
          })
    return loaded
  }

  const notify = (event: RuntimeEvent): void => {
    for (const subscriber of subscribers.get(event.sessionID) ?? []) subscriber.push(event)
  }

  async function* streamSubscription(
    sessionID: string,
    subscription?: NexumEventSubscriptionOptions,
  ): AsyncGenerator<RuntimeEvent> {
    await load()
    const subscriber = createSubscriber()
    const current = subscribers.get(sessionID) ?? new Set<Subscriber>()
    current.add(subscriber)
    subscribers.set(sessionID, current)
    try {
      for (const event of replayHistory(history.get(sessionID) ?? [], subscription)) yield event
      while (true) yield await subscriber.next()
    } finally {
      current.delete(subscriber)
      if (current.size === 0) subscribers.delete(sessionID)
    }
  }

  return {
    async publish(event) {
      if (filePath === undefined) {
        history = appendEvent(history, event)
        reservedSequences.set(event.sessionID, Math.max(reservedSequences.get(event.sessionID) ?? 0, event.sequence))
        notify(event)
        return
      }
      const operation = writeQueue.then(async () => {
        await load()
        const next = appendEvent(history, event)
        await persistEvents(filePath, next)
        history = next
        reservedSequences.set(event.sessionID, Math.max(reservedSequences.get(event.sessionID) ?? 0, event.sequence))
        notify(event)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    subscribe(sessionID, subscription) {
      return streamSubscription(sessionID, subscription)
    },
    lastSequence(sessionID) {
      return history.get(sessionID)?.at(-1)?.sequence ?? 0
    },
    async nextSequence(sessionID) {
      await load()
      const current = Math.max(history.get(sessionID)?.at(-1)?.sequence ?? 0, reservedSequences.get(sessionID) ?? 0)
      const next = current + 1
      reservedSequences.set(sessionID, next)
      return next
    },
    async delete(sessionID) {
      if (filePath === undefined) {
        const next = new Map(history)
        next.delete(sessionID)
        history = next
        reservedSequences.delete(sessionID)
        return
      }
      const operation = writeQueue.then(async () => {
        await load()
        const next = new Map(history)
        next.delete(sessionID)
        await persistEvents(filePath, next)
        history = next
        reservedSequences.delete(sessionID)
      })
      writeQueue = operation.then(
        () => undefined,
        () => undefined,
      )
      await operation
    },
    ready() {
      return load()
    },
  }
}

function replayHistory(events: readonly RuntimeEvent[], options?: NexumEventSubscriptionOptions): RuntimeEvent[] {
  const afterEventID = options?.afterEventID?.trim() || undefined
  const afterSequence = options?.afterSequence
  if (afterEventID === undefined && afterSequence === undefined) return [...events]

  const index = afterEventID === undefined ? -1 : findLastIndexByEventID(events, afterEventID)
  if (afterEventID !== undefined && index === -1) {
    return afterSequence === undefined ? [...events] : events.filter((event) => event.sequence > afterSequence)
  }

  const idSequence = index === -1 ? undefined : events[index]!.sequence
  const cursor = idSequence === undefined ? afterSequence : Math.max(idSequence, afterSequence ?? idSequence)
  if (cursor === undefined) return []
  return events.filter((event) => event.sequence > cursor)
}

function findLastIndexByEventID(events: readonly RuntimeEvent[], eventID: string): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]!.eventID === eventID) return index
  }
  return -1
}

interface Subscriber {
  readonly push: (event: RuntimeEvent) => void
  readonly next: () => Promise<RuntimeEvent>
}

function createSubscriber(initial: readonly RuntimeEvent[] = []): Subscriber {
  const queue: RuntimeEvent[] = []
  const waiters: Array<(event: RuntimeEvent) => void> = []
  const deliveredIDs = new Set<string>()
  const deliveredOrder: string[] = []

  const mark = (event: RuntimeEvent) => {
    const key = deliveryKey(event)
    deliveredIDs.add(key)
    deliveredOrder.push(key)
    if (deliveredOrder.length > dedupeWindow) {
      const evicted = deliveredOrder.shift()
      if (evicted !== undefined) deliveredIDs.delete(evicted)
    }
  }

  const deliver = (event: RuntimeEvent) => {
    mark(event)
    const waiter = waiters.shift()
    if (waiter) waiter(event)
    else queue.push(event)
  }

  for (const event of initial) deliver(event)

  return {
    push(event) {
      if (deliveredIDs.has(deliveryKey(event))) return
      deliver(event)
    },
    next() {
      const event = queue.shift()
      if (event) return Promise.resolve(event)
      return new Promise((resolve) => waiters.push(resolve))
    },
  }
}

function deliveryKey(event: RuntimeEvent): string {
  return event.eventID ?? `${event.sessionID}:${event.sequence}`
}

function appendEvent(history: Map<string, RuntimeEvent[]>, event: RuntimeEvent): Map<string, RuntimeEvent[]> {
  const events = [...(history.get(event.sessionID) ?? []), event]
  if (events.length > historyLimit) events.splice(0, events.length - historyLimit)
  const next = new Map(history)
  next.set(event.sessionID, events)
  return next
}

interface StoredEventFile {
  readonly version: number
  readonly sessions: Record<string, readonly unknown[]>
}

async function readEventsFile(filePath: string): Promise<Map<string, RuntimeEvent[]>> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw new NexumEventStoreError("事件文件无法读取")
  })
  if (text === undefined) return new Map()
  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch {
    throw new NexumEventStoreError("事件文件格式无效")
  }
  if (!isStoredEventFile(payload)) throw new NexumEventStoreError("事件文件格式无效")
  const sessions = new Map<string, RuntimeEvent[]>()
  for (const [sessionID, values] of Object.entries(payload.sessions)) {
    if (!Array.isArray(values)) throw new NexumEventStoreError("事件文件格式无效")
    const events = values.map((value) => toRuntimeEvent(value, sessionID))
    if (events.length === 0) continue
    sessions.set(sessionID, events.slice(-historyLimit))
  }
  return sessions
}

async function persistEvents(filePath: string, history: Map<string, RuntimeEvent[]>): Promise<void> {
  const sessions: Record<string, readonly RuntimeEvent[]> = {}
  for (const [sessionID, events] of history) sessions[sessionID] = events
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, sessions }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(temporaryPath, filePath)
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new NexumEventStoreError("事件文件写入失败")
  }
}

function toRuntimeEvent(value: unknown, sessionID: string): RuntimeEvent {
  if (!isRecord(value)) throw new NexumEventStoreError("事件文件格式无效")
  if (typeof value.type !== "string" || typeof value.sequence !== "number" || !Number.isFinite(value.sequence)) {
    throw new NexumEventStoreError("事件文件格式无效")
  }
  if (value.sessionID !== undefined && value.sessionID !== sessionID) {
    throw new NexumEventStoreError("事件文件格式无效")
  }
  return {
    type: value.type,
    sessionID,
    sequence: value.sequence,
    ...(typeof value.eventID === "string" ? { eventID: value.eventID } : {}),
    ...(typeof value.runID === "string" ? { runID: value.runID } : {}),
    ...(typeof value.occurredAt === "string" ? { occurredAt: value.occurredAt } : {}),
    ...(isRecord(value.data) ? { data: value.data } : {}),
  }
}

function isStoredEventFile(value: unknown): value is StoredEventFile {
  return isRecord(value) && value.version === 1 && isRecord(value.sessions)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}
