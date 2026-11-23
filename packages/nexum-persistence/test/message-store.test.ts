import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  NexumMessageStoreError,
  type ModelMessage,
  type ModelToolCall,
} from "@nexum/core"
import { createFileMessageStore, createInMemoryMessageStore } from "../src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryFilePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nexum-message-store-"))
  temporaryDirectories.push(directory)
  return join(directory, "messages.json")
}

const conversation: readonly ModelMessage[] = [
  { role: "user", content: "请读取 README.md" },
  {
    role: "assistant",
    content: "我先读取文件",
    reasoningContent: "需要先确认文件内容",
    toolCalls: [{ id: "call_read_001", name: "read", input: { path: "README.md" } }],
  },
  { role: "tool", toolCallID: "call_read_001", content: "README 内容" },
  { role: "assistant", content: "文件内容已读取" },
]

test("keeps history in memory per session without sharing mutable state", async () => {
  const store = createInMemoryMessageStore()

  await store.save("session_a", conversation)

  expect(await store.load("session_a")).toEqual(conversation)
  expect(await store.load("session_b")).toEqual([])

  const loaded = (await store.load("session_a")) as ModelMessage[]
  loaded[0] = { role: "user", content: "被外部改写" }
  const assistant = loaded[1]
  if (assistant.role === "assistant" && assistant.toolCalls) {
    ;(assistant.toolCalls as ModelToolCall[])[0] = { id: "mutated", name: "mutated", input: {} }
  }

  expect(await store.load("session_a")).toEqual(conversation)
})

test("deletes one in-memory history while preserving other sessions", async () => {
  const store = createInMemoryMessageStore()

  await store.save("session_delete", conversation)
  await store.save("session_keep", [{ role: "user", content: "保留的会话" }])
  await store.delete("session_delete")
  await store.delete("missing")

  expect(await store.load("session_delete")).toEqual([])
  expect(await store.load("session_keep")).toEqual([{ role: "user", content: "保留的会话" }])
})

test("persists every session to a fresh file store instance", async () => {
  const filePath = await temporaryFilePath()
  const store = createFileMessageStore({ filePath })

  expect(await store.load("session_a")).toEqual([])

  await store.save("session_a", conversation)
  await store.save("session_b", [{ role: "user", content: "第二个会话" }])

  const reopened = createFileMessageStore({ filePath })
  expect(await reopened.load("session_a")).toEqual(conversation)
  expect(await reopened.load("session_b")).toEqual([{ role: "user", content: "第二个会话" }])
  expect(JSON.parse(await readFile(filePath, "utf8"))).toMatchObject({ version: 1 })
})

test("serializes concurrent saves so no session is lost", async () => {
  const filePath = await temporaryFilePath()
  const store = createFileMessageStore({ filePath })

  await Promise.all([
    store.save("session_a", [{ role: "user", content: "第一轮" }]),
    store.save("session_b", [{ role: "user", content: "第二轮" }]),
    store.save("session_a", [{ role: "user", content: "第三轮" }]),
  ])

  const reopened = createFileMessageStore({ filePath })
  expect(await reopened.load("session_a")).toEqual([{ role: "user", content: "第三轮" }])
  expect(await reopened.load("session_b")).toEqual([{ role: "user", content: "第二轮" }])
})

test("reports a stable corrupt_file code for unreadable history and keeps the file intact", async () => {
  const filePath = await temporaryFilePath()
  await writeFile(filePath, "{ not json", "utf8")

  const store = createFileMessageStore({ filePath })

  await expect(store.load("session_a")).rejects.toMatchObject({ code: "corrupt_file" })
  await expect(store.save("session_a", conversation)).rejects.toMatchObject({ code: "corrupt_file" })
  expect(await readFile(filePath, "utf8")).toBe("{ not json")
})

test("rejects history records with an invalid canonical message shape", async () => {
  const filePath = await temporaryFilePath()
  await writeFile(
    filePath,
    JSON.stringify({ version: 1, sessions: { session_a: [{ role: "assistant", content: 42 }] } }),
    "utf8",
  )

  const store = createFileMessageStore({ filePath })

  const error = await store.load("session_a").catch((reason: unknown) => reason)
  expect(error).toBeInstanceOf(NexumMessageStoreError)
  expect(error).toMatchObject({ name: "NexumMessageStoreError", code: "corrupt_file" })
})

test("deletes one session history while preserving other sessions after restart", async () => {
  const filePath = await temporaryFilePath()
  const store = createFileMessageStore({ filePath })

  await store.save("session_delete", conversation)
  await store.save("session_keep", [{ role: "user", content: "保留的会话" }])
  await store.delete("session_delete")
  await store.delete("missing")

  expect(await store.load("session_delete")).toEqual([])
  expect(await store.load("session_keep")).toEqual([{ role: "user", content: "保留的会话" }])

  const reopened = createFileMessageStore({ filePath })
  expect(await reopened.load("session_delete")).toEqual([])
  expect(await reopened.load("session_keep")).toEqual([{ role: "user", content: "保留的会话" }])
})
