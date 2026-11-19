import { expect, test } from "bun:test"
import { createHeadlessEventHub } from "../src/events.ts"

test("event hub delivers events to session subscribers and cleans up on return", async () => {
  const hub = createHeadlessEventHub()
  const iterator = hub.subscribe("session-001")[Symbol.asyncIterator]()
  const pending = iterator.next()
  const event = {
    type: "tool.requested",
    sessionID: "session-001",
    sequence: 2,
    data: { toolName: "read" },
  }

  await hub.publish(event)

  expect(await pending).toEqual({ done: false, value: event })
  await iterator.return?.()
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
})
