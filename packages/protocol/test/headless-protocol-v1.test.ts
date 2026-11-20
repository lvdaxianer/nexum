import { expect, test } from "bun:test"
import { Schema } from "effect"
import {
  HeadlessCapabilities,
  HeadlessEvent,
  HeadlessResponseMeta,
  HeadlessSessionState,
} from "../src/groups/headless.js"

test("decodes the v1 success metadata and capability discovery contract", () => {
  const meta = Schema.decodeUnknownSync(HeadlessResponseMeta)({
    protocolVersion: "headless.v1",
    traceId: "trace_001",
  })
  const capabilities = Schema.decodeUnknownSync(HeadlessCapabilities)({
    protocolVersion: "headless.v1",
    transport: { http: "json", events: "sse" },
    features: [
      "model",
      "session",
      "prompt",
      "permission",
      "question",
      "context_compaction",
      "project_context",
      "skill",
    ],
    eventTypes: ["assistant.text", "permission.requested"],
  })

  expect(meta.protocolVersion).toBe("headless.v1")
  expect(capabilities.transport.events).toBe("sse")
  expect(capabilities.features).toContain("permission")
})

test("decodes a recoverable session state and an identified runtime event", () => {
  const state = Schema.decodeUnknownSync(HeadlessSessionState)({
    session: { id: "session_001", directory: "/workspace/demo", status: "running" },
    pendingPermissions: [],
    pendingQuestions: [],
    lastSequence: 4,
  })
  const event = Schema.decodeUnknownSync(HeadlessEvent)({
    eventID: "event_004",
    runID: "run_001",
    sessionID: "session_001",
    type: "assistant.text",
    sequence: 4,
    occurredAt: "2026-11-20T03:00:00.000Z",
    data: { content: "完成" },
  })

  expect(state.lastSequence).toBe(4)
  expect(event.eventID).toBe("event_004")
  expect(event.data).toEqual({ content: "完成" })
})
