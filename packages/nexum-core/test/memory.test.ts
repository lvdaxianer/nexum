import { expect, test } from "bun:test"
import type { MemoryPort } from "../src/index.ts"
import { createInMemoryMemory } from "@nexum/adapters"

test("stores and searches namespaced memory without leaking mutable metadata", async () => {
  const memory: MemoryPort = createInMemoryMemory({ now: () => "2026-11-22T00:00:00.000Z" })
  const metadata = { source: "test" }
  await memory.upsert({ id: "one", namespace: "session-1", content: "Nexum runtime", metadata })
  metadata.source = "mutated"

  expect(await memory.search({ namespace: "session-1", text: "runtime" })).toEqual([
    {
      id: "one",
      namespace: "session-1",
      content: "Nexum runtime",
      metadata: { source: "test" },
      createdAt: "2026-11-22T00:00:00.000Z",
      updatedAt: "2026-11-22T00:00:00.000Z",
    },
  ])
})

test("removes memory by namespace or globally", async () => {
  const memory = createInMemoryMemory()
  await memory.upsert({ id: "same", namespace: "one", content: "one" })
  await memory.upsert({ id: "same", namespace: "two", content: "two" })

  await memory.remove("same", "one")
  expect(await memory.search()).toHaveLength(1)
  await memory.remove("same")
  expect(await memory.search()).toHaveLength(0)
})
