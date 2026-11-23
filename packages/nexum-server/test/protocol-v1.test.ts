import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NEXUM_EVENT_TYPES } from "@nexum/protocol"
import { createNexumSessionService } from "./test-ports.ts"
import { createNexumEventHub } from "../src/events.ts"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("exposes capabilities and v1 response metadata", async () => {
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/capabilities", server.url), {
    headers: { "x-trace-id": "capability_trace" },
  })
  const body = (await response.json()) as {
    data: {
      protocolVersion: string
      transport: { events: string }
      features: readonly string[]
      eventTypes: readonly string[]
      capabilities: readonly { id: string; status: string }[]
    }
    meta: { protocolVersion: string; traceId: string }
  }

  expect(response.status).toBe(200)
  expect(body.meta).toEqual({ protocolVersion: "nexum.runtime.v1", traceId: "capability_trace" })
  expect(body.data.protocolVersion).toBe("nexum.runtime.v1")
  expect(body.data.transport.events).toBe("sse")
  expect(body.data.features).toContain("permission")
  expect(body.data.capabilities.find((capability) => capability.id === "memory")?.status).toBe("disabled")
  expect(body.data.eventTypes).toEqual(NEXUM_EVENT_TYPES)
})

test("returns a session snapshot with pending collections and last sequence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-protocol-v1-state-"))
  directories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const server = await startNexumServer({ port: 0, sessionService })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/state`, server.url))
  const body = (await response.json()) as {
    data: { session: { id: string }; pendingPermissions: unknown[]; pendingQuestions: unknown[]; lastSequence: number }
    meta: { protocolVersion: string }
  }

  expect(response.status).toBe(200)
  expect(body.data.session.id).toBe(session.sessionID)
  expect(body.data.pendingPermissions).toEqual([])
  expect(body.data.pendingQuestions).toEqual([])
  expect(body.data.lastSequence).toBe(0)
  expect(body.meta.protocolVersion).toBe("nexum.runtime.v1")
})

test("emits SSE event and id fields and replays after Last-Event-ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-protocol-v1-events-"))
  directories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createNexumEventHub()
  await eventHub.publish({
    eventID: "event_001",
    runID: "run_001",
    sessionID: session.sessionID,
    type: "assistant.text",
    sequence: 1,
    occurredAt: "2026-11-20T03:00:00.000Z",
    data: { content: "第一条" },
  })
  const server = await startNexumServer({ port: 0, sessionService, eventHub })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/events`, server.url), {
    headers: { "last-event-id": "event_000" },
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  const chunk = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE 重放超时")), 1_000)),
  ])
  const text = new TextDecoder().decode(chunk.value)

  expect(text).toContain("event: assistant.text")
  expect(text).toContain("id: event_001")
  expect(text).toContain('"eventID":"event_001"')
  await reader.cancel()
})
