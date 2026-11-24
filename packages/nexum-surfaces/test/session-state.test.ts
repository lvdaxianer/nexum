import { expect, test } from "bun:test"
import type { NexumSession } from "@nexum/client"
import { mergeSessionStatus } from "../src/session-state"

test("merges a terminal status into the matching Session without replacing unchanged items", () => {
  const sessions = [session("session_001", "idle"), session("session_002", "running")]

  const updated = mergeSessionStatus(sessions, "session_001", "completed")

  expect(updated[0]).toMatchObject({ id: "session_001", status: "completed" })
  expect(updated[1]).toBe(sessions[1])
})

test("keeps the existing list reference when a terminal status is already current", () => {
  const sessions = [session("session_001", "completed")]

  expect(mergeSessionStatus(sessions, "session_001", "completed")).toBe(sessions)
})

function session(id: string, status: NexumSession["status"]): NexumSession {
  return {
    id,
    name: id,
    directory: `/tmp/${id}`,
    status,
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
  }
}
