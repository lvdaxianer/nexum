import { expect, test } from "bun:test"
import { createMemoryPersistence } from "../src/index.ts"

test("内存组合在实例之间保持隔离", async () => {
  const first = createMemoryPersistence()
  const second = createMemoryPersistence()
  const session = {
    sessionID: "session-memory",
    name: "memory",
    directory: "/tmp/memory",
    status: "idle" as const,
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
  }

  await first.sessionStore.save(session)

  expect(await second.sessionStore.get(session.sessionID)).toBeUndefined()
  expect(await first.sessionStore.get(session.sessionID)).toEqual(session)
})
