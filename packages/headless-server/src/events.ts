/**
 * Headless Server 的进程内事件 Hub 与 SSE 订阅端口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { EventSink, RuntimeEvent } from "@opencode/headless-core"

/** 可发布并按 Session 订阅运行事件的事件 Hub。 */
export interface HeadlessEventHub extends EventSink {
  readonly subscribe: (sessionID: string, options?: HeadlessEventSubscriptionOptions) => AsyncIterable<RuntimeEvent>
  readonly lastSequence: (sessionID: string) => number
}

/** SSE 重连时使用的事件游标。 */
export interface HeadlessEventSubscriptionOptions {
  readonly afterEventID?: string
  readonly afterSequence?: number
}

/**
 * 创建进程内 Headless Event Hub。
 *
 * @returns 可供 Coding Loop 和 SSE handler 共用的事件端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessEventHub(): HeadlessEventHub {
  const subscribers = new Map<string, Set<Subscriber>>()
  const history = new Map<string, RuntimeEvent[]>()
  const historyLimit = 256

  return {
    async publish(event) {
      const events = history.get(event.sessionID) ?? []
      events.push(event)
      if (events.length > historyLimit) events.splice(0, events.length - historyLimit)
      history.set(event.sessionID, events)
      for (const subscriber of subscribers.get(event.sessionID) ?? []) subscriber.push(event)
    },
    subscribe(sessionID, options) {
      const subscriber = createSubscriber(replayHistory(history.get(sessionID) ?? [], options))
      const current = subscribers.get(sessionID) ?? new Set<Subscriber>()
      current.add(subscriber)
      subscribers.set(sessionID, current)

      return (async function* () {
        try {
          while (true) yield await subscriber.next()
        } finally {
          current.delete(subscriber)
          if (current.size === 0) subscribers.delete(sessionID)
        }
      })()
    },
    lastSequence(sessionID) {
      return history.get(sessionID)?.at(-1)?.sequence ?? 0
    },
  }
}

function replayHistory(events: readonly RuntimeEvent[], options?: HeadlessEventSubscriptionOptions): RuntimeEvent[] {
  if (!options || (options.afterEventID === undefined && options.afterSequence === undefined)) return []
  if (options.afterSequence !== undefined) return events.filter((event) => event.sequence > options.afterSequence!)
  const index = events.findIndex((event) => event.eventID === options.afterEventID)
  return index === -1 ? [...events] : events.slice(index + 1)
}

interface Subscriber {
  readonly push: (event: RuntimeEvent) => void
  readonly next: () => Promise<RuntimeEvent>
}

function createSubscriber(initial: readonly RuntimeEvent[] = []): Subscriber {
  const queue: RuntimeEvent[] = [...initial]
  const waiters: Array<(event: RuntimeEvent) => void> = []

  return {
    push(event) {
      const waiter = waiters.shift()
      if (waiter) waiter(event)
      else queue.push(event)
    },
    next() {
      const event = queue.shift()
      if (event) return Promise.resolve(event)
      return new Promise((resolve) => waiters.push(resolve))
    },
  }
}
