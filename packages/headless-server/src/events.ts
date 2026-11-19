/**
 * Headless Server 的进程内事件 Hub 与 SSE 订阅端口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { EventSink, RuntimeEvent } from "@opencode/headless-core"

/** 可发布并按 Session 订阅运行事件的事件 Hub。 */
export interface HeadlessEventHub extends EventSink {
  readonly subscribe: (sessionID: string) => AsyncIterable<RuntimeEvent>
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

  return {
    async publish(event) {
      for (const subscriber of subscribers.get(event.sessionID) ?? []) subscriber.push(event)
    },
    subscribe(sessionID) {
      const subscriber = createSubscriber()
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
  }
}

interface Subscriber {
  readonly push: (event: RuntimeEvent) => void
  readonly next: () => Promise<RuntimeEvent>
}

function createSubscriber(): Subscriber {
  const queue: RuntimeEvent[] = []
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
