import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHeadlessEventHub, HeadlessEventStoreError } from "../src/events.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function createEventDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "headless-event-store-"))
  temporaryDirectories.push(directory)
  return directory
}

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

test("event hub replays history on first subscribe and resumes after a cursor", async () => {
  const hub = createHeadlessEventHub()
  const first = { type: "assistant.text", sessionID: "session-002", sequence: 1, eventID: "e1", data: {} }
  const second = { type: "tool.result", sessionID: "session-002", sequence: 2, eventID: "e2", data: {} }
  await hub.publish(first)
  await hub.publish(second)

  const initial = hub.subscribe("session-002")[Symbol.asyncIterator]()
  expect((await Promise.all([initial.next(), initial.next()])).map((result) => result.value.sequence)).toEqual([1, 2])
  await initial.return?.()

  const resumed = hub.subscribe("session-002", { afterEventID: "e1" })[Symbol.asyncIterator]()
  expect(await resumed.next()).toEqual({ done: false, value: second })
  await resumed.return?.()
})

test("persists events so a new hub replays history and resumes from a cursor", async () => {
  const filePath = join(await createEventDirectory(), "events.json")
  const first = createHeadlessEventHub({ filePath })
  await first.ready?.()
  const firstEvent = { type: "assistant.text", sessionID: "session-persist-001", sequence: 1, eventID: "p1", data: {} }
  const secondEvent = { type: "tool.result", sessionID: "session-persist-001", sequence: 2, eventID: "p2", data: {} }
  await first.publish(firstEvent)
  await first.publish(secondEvent)

  const second = createHeadlessEventHub({ filePath })
  await second.ready?.()
  expect(second.lastSequence("session-persist-001")).toBe(2)

  const replay = second.subscribe("session-persist-001")[Symbol.asyncIterator]()
  expect((await Promise.all([replay.next(), replay.next()])).map((result) => result.value.sequence)).toEqual([1, 2])
  await replay.return?.()

  const resumed = second.subscribe("session-persist-001", { afterEventID: "p1" })[Symbol.asyncIterator]()
  expect(await resumed.next()).toEqual({ done: false, value: secondEvent })
  await resumed.return?.()

  const bySequence = second.subscribe("session-persist-001", { afterSequence: 1 })[Symbol.asyncIterator]()
  expect(await bySequence.next()).toEqual({ done: false, value: secondEvent })
  await bySequence.return?.()
})

test("keeps every concurrently published event in the persisted file", async () => {
  const filePath = join(await createEventDirectory(), "events.json")
  const hub = createHeadlessEventHub({ filePath })
  await hub.ready?.()
  const live = hub.subscribe("session-concurrent-001")[Symbol.asyncIterator]()
  const pendingLive = live.next()
  await Promise.all(
    Array.from({ length: 32 }, (_, index) =>
      hub.publish({
        type: "assistant.text",
        sessionID: "session-concurrent-001",
        sequence: index + 1,
        eventID: `c${index + 1}`,
        data: { index },
      }),
    ),
  )

  const liveSequences: number[] = [(await pendingLive).value.sequence]
  for (let index = 0; index < 31; index += 1) liveSequences.push((await live.next()).value.sequence)
  await live.return?.()

  const reopened = createHeadlessEventHub({ filePath })
  await reopened.ready?.()
  const replay = reopened.subscribe("session-concurrent-001")[Symbol.asyncIterator]()
  const persistedSequences: number[] = []
  for (let index = 0; index < 32; index += 1) persistedSequences.push((await replay.next()).value.sequence)
  await replay.return?.()

  const expected = Array.from({ length: 32 }, (_, index) => index + 1)
  expect(persistedSequences).toEqual(expected)
  expect(liveSequences).toEqual(expected)
  expect(reopened.lastSequence("session-concurrent-001")).toBe(32)
})

test("leaves a corrupt event file untouched and hides internal paths", async () => {
  const directory = await createEventDirectory()
  const filePath = join(directory, "events.json")
  await Bun.write(filePath, "not-json")

  const hub = createHeadlessEventHub({ filePath })
  const error = await hub.ready?.().then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(HeadlessEventStoreError)
  expect((error as Error).message).toBe("事件文件格式无效")
  expect((error as Error).message).not.toContain(directory)

  await expect(
    hub.publish({ type: "assistant.text", sessionID: "session-corrupt-001", sequence: 1, eventID: "x1", data: {} }),
  ).rejects.toThrow("事件文件格式无效")
  expect(await Bun.file(filePath).text()).toBe("not-json")
})
