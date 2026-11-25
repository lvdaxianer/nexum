import type { Database } from "bun:sqlite"
import type { EventSink, RuntimeEvent } from "@nexum/core"

export interface NexumSqliteEventHub extends EventSink {
  readonly subscribe: (sessionID: string, options?: { readonly afterEventID?: string; readonly afterSequence?: number }) => AsyncIterable<RuntimeEvent>
  readonly lastSequence: (sessionID: string) => number
  readonly delete: (sessionID: string) => Promise<void>
  readonly ready: () => Promise<void>
}

const historyLimit = 256

export function createSqliteEventHub(database: Database): NexumSqliteEventHub {
  const subscribers = new Map<string, Set<Subscriber>>()
  const history = new Map<string, RuntimeEvent[]>()
  const rows = database.query("SELECT payload FROM nexum_event ORDER BY session_id, sequence").all() as Array<{ payload: string }>
  rows.map((row) => JSON.parse(row.payload) as RuntimeEvent).forEach((event) => appendHistory(history, event))

  const notify = (event: RuntimeEvent): void => {
    for (const subscriber of subscribers.get(event.sessionID) ?? []) subscriber.push(event)
  }

  async function* subscribe(sessionID: string, options?: { readonly afterEventID?: string; readonly afterSequence?: number }): AsyncIterable<RuntimeEvent> {
    const subscriber = createSubscriber()
    const current = subscribers.get(sessionID) ?? new Set<Subscriber>()
    current.add(subscriber)
    subscribers.set(sessionID, current)
    try {
      for (const event of replay(history.get(sessionID) ?? [], options)) yield event
      while (true) yield await subscriber.next()
    } finally {
      current.delete(subscriber)
      if (current.size === 0) subscribers.delete(sessionID)
    }
  }

  const persistEvent = database.transaction((event: RuntimeEvent) => {
    database.query("INSERT OR REPLACE INTO nexum_event (session_id, sequence, event_id, payload) VALUES ($sessionID, $sequence, $eventID, $payload)").run({
      $sessionID: event.sessionID,
      $sequence: event.sequence,
      $eventID: event.eventID ?? null,
      $payload: JSON.stringify(event),
    })
    appendHistory(history, event)
    database.query("DELETE FROM nexum_event WHERE session_id = $sessionID AND sequence NOT IN (SELECT sequence FROM nexum_event WHERE session_id = $sessionID ORDER BY sequence DESC LIMIT 256)").run({ $sessionID: event.sessionID })
    notify(event)
  })

  return {
    async publish(event) {
      persistEvent(event)
    },
    subscribe,
    lastSequence(sessionID) {
      return history.get(sessionID)?.at(-1)?.sequence ?? 0
    },
    async delete(sessionID) {
      database.query("DELETE FROM nexum_event WHERE session_id = $sessionID").run({ $sessionID: sessionID })
      history.delete(sessionID)
    },
    ready: async () => undefined,
  }
}

function appendHistory(history: Map<string, RuntimeEvent[]>, event: RuntimeEvent): void {
  const events = [...(history.get(event.sessionID) ?? []).filter((item) => item.sequence !== event.sequence), event]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-historyLimit)
  history.set(event.sessionID, events)
}

function replay(events: readonly RuntimeEvent[], options?: { readonly afterEventID?: string; readonly afterSequence?: number }): RuntimeEvent[] {
  const index = options?.afterEventID === undefined ? -1 : events.findIndex((event) => event.eventID === options.afterEventID)
  const eventSequence = index < 0 ? undefined : events[index]?.sequence
  const cursor = eventSequence === undefined ? options?.afterSequence : Math.max(eventSequence, options?.afterSequence ?? eventSequence)
  return cursor === undefined ? [...events] : events.filter((event) => event.sequence > cursor)
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
      return event ? Promise.resolve(event) : new Promise((resolve) => waiters.push(resolve))
    },
  }
}
