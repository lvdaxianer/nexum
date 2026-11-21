import { expect, test } from "bun:test"
import type { HeadlessSessionService, SessionRecord } from "../src/index.ts"
import { createHeadlessCodingLoop, type EventSink, type ModelPort, type PermissionPort } from "../src/index.ts"

test("gives events a run identity and keeps sequence monotonic across prompts", async () => {
  const session: SessionRecord = {
    sessionID: "session_001",
    name: "demo",
    directory: "/workspace/demo",
    status: "idle",
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  }
  const events: Array<{
    eventID: string
    runID: string
    sessionID: string
    sequence: number
    occurredAt: string
  }> = []
  let status: SessionRecord["status"] = "idle"
  const sessions: HeadlessSessionService = {
    async create() {
      return session
    },
    async list() {
      return [session]
    },
    async get() {
      return { ...session, status }
    },
    async update(_sessionID: string, input) {
      return { ...session, name: input.name }
    },
    async setStatus(_sessionID: string, nextStatus: SessionRecord["status"]) {
      return { ...session, status: nextStatus }
    },
  }
  const model: ModelPort = {
    async *prompt() {
      yield { type: "completed" as const }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event as (typeof events)[number])
    },
  }
  const loop = createHeadlessCodingLoop({
    model,
    tool: {
      async execute() {
        return { ok: true, output: "" }
      },
    },
    permission,
    sessions,
    events: eventSink,
  })

  await loop.run({ sessionID: session.sessionID, text: "第一次" })
  status = "idle"
  await loop.run({ sessionID: session.sessionID, text: "第二次" })

  expect(events).toHaveLength(2)
  expect(events[0]?.sessionID).toBe(session.sessionID)
  expect(events[0]?.runID).toBeString()
  expect(events[1]?.runID).toBeString()
  expect(events[1]?.runID).not.toBe(events[0]?.runID)
  expect(events.map((event) => event.sequence)).toEqual([1, 2])
  expect(events.every((event) => event.eventID.length > 0 && !Number.isNaN(Date.parse(event.occurredAt)))).toBe(true)
})
