import { expect, test } from "bun:test"
import { NEXUM_API_PREFIX, NEXUM_EVENT_TYPES, NEXUM_PROTOCOL_VERSION } from "../src/index.ts"
import type { NexumEvent, NexumReasoningEventData } from "../src/index.ts"

test("uses Nexum protocol identity and API boundary", () => {
  expect(NEXUM_PROTOCOL_VERSION).toBe("nexum.runtime.v1")
  expect(NEXUM_API_PREFIX).toBe("/api/nexum")
})

test("publishes typed reasoning events in the protocol contract", () => {
  expect(NEXUM_EVENT_TYPES).toEqual(expect.arrayContaining([
    "assistant.thinking",
    "assistant.reasoning",
    "assistant.text",
  ]))

  const data: NexumReasoningEventData = { content: "先检查可用仓库源" }
  const event: NexumEvent = {
    eventID: "event_reasoning_001",
    runID: "run_001",
    type: "assistant.reasoning",
    sessionID: "session_001",
    sequence: 1,
    occurredAt: "2026-11-22T03:00:00.000Z",
    data,
  }

  expect(event.data).toEqual(data)
})
