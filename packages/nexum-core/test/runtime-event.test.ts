import { expect, test } from "bun:test"
import type { NexumSessionService, SessionRecord } from "../src/index.ts"
import { type EventSink, type ModelPort, type PermissionPort } from "../src/index.ts"
import { createNexumCodingLoop } from "./test-ports.ts"

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
  const sessions: NexumSessionService = {
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
    async setMode(_sessionID, mode) {
      return { ...session, mode }
    },
    async setStatus(_sessionID: string, nextStatus: SessionRecord["status"]) {
      return { ...session, status: nextStatus }
    },
    async delete() {},
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
  const loop = createNexumCodingLoop({
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

  expect(events).toHaveLength(6)
  expect(events[0]?.sessionID).toBe(session.sessionID)
  expect(events[0]?.runID).toBeString()
  expect(events[1]?.runID).toBe(events[0]?.runID)
  expect(events[2]?.runID).toBe(events[0]?.runID)
  expect(events[3]?.runID).toBeString()
  expect(events[3]?.runID).not.toBe(events[0]?.runID)
  expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6])
  expect(events.every((event) => event.eventID.length > 0 && !Number.isNaN(Date.parse(event.occurredAt)))).toBe(true)
})

test("continues event sequence after loading the persisted session cursor", async () => {
  const session: SessionRecord = {
    sessionID: "session_cursor_001",
    name: "cursor",
    directory: "/workspace/cursor",
    status: "idle",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  }
  const events: Array<{ type: string; sequence: number }> = []
  const sessions: NexumSessionService = {
    async create() {
      return session
    },
    async list() {
      return [session]
    },
    async get() {
      return session
    },
    async update(_sessionID: string, input) {
      return { ...session, name: input.name }
    },
    async setMode(_sessionID, mode) {
      return { ...session, mode }
    },
    async setStatus(_sessionID: string, status: SessionRecord["status"]) {
      return { ...session, status }
    },
    async delete() {},
  }
  const loop = createNexumCodingLoop({
    model: {
      async *prompt() {
        yield { type: "text" as const, content: "ok" }
        yield { type: "completed" as const }
      },
    },
    tool: {
      async execute() {
        return { ok: true, output: "" }
      },
    },
    permission: {
      async evaluate() {
        return "allow" as const
      },
    },
    sessions,
    events: {
      lastSequence() {
        return 7
      },
      async publish(event) {
        events.push({ type: event.type, sequence: event.sequence })
      },
    },
  })

  await loop.run({ sessionID: session.sessionID, text: "继续" })

  expect(events.map((event) => event.sequence)).toEqual([8, 9, 10, 11])
})

test("uses the EventSink allocator when one is available", async () => {
  const session: SessionRecord = {
    sessionID: "session_allocator_001",
    name: "allocator",
    directory: "/workspace/allocator",
    status: "idle",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
  }
  const events: number[] = []
  let sequence = 40
  const sessions: NexumSessionService = {
    async create() {
      return session
    },
    async list() {
      return [session]
    },
    async get() {
      return session
    },
    async update(_sessionID, input) {
      return { ...session, name: input.name }
    },
    async setMode(_sessionID, mode) {
      return { ...session, mode }
    },
    async setStatus(_sessionID, status) {
      return { ...session, status }
    },
    async delete() {},
  }
  const loop = createNexumCodingLoop({
    model: {
      async *prompt() {
        yield { type: "completed" as const }
      },
    },
    tool: {
      async execute() {
        return { ok: true, output: "" }
      },
    },
    permission: {
      async evaluate() {
        return "allow" as const
      },
    },
    sessions,
    events: {
      async nextSequence() {
        sequence += 1
        return sequence
      },
      async publish(event) {
        events.push(event.sequence)
      },
    },
  })

  await loop.run({ sessionID: session.sessionID, text: "使用共享序号" })

  expect(events).toEqual([41, 42, 43])
})
