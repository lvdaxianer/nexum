import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFileExecutionStore, createInMemoryExecutionStore } from "../src/execution-store.ts"

test("persists execution claims and terminal recovery state across file store instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-execution-store-"))
  const filePath = join(directory, "executions.json")
  const first = createFileExecutionStore({ filePath })
  await first.claim({ executionID: "exec_file", sessionID: "session_file", mode: "prompt", maxAttempts: 3 })
  await first.settle("exec_file", "recovery_waiting", "not_continuable")

  const second = createFileExecutionStore({ filePath })
  expect(await second.get("exec_file")).toMatchObject({
    executionID: "exec_file",
    sessionID: "session_file",
    attempt: 1,
    status: "recovery_waiting",
    errorCode: "not_continuable",
  })
  await second.deleteSession("session_file")
  expect(await second.list()).toEqual([])
  await rm(directory, { recursive: true, force: true })
})

test("keeps in-memory execution claims isolated and increments recovery attempts", async () => {
  const store = createInMemoryExecutionStore()
  await store.claim({ executionID: "exec_memory", sessionID: "session_memory", mode: "prompt", maxAttempts: 3 })
  await store.claim({ executionID: "exec_memory", sessionID: "session_memory", mode: "recovery", maxAttempts: 3 })

  expect(await store.get("exec_memory")).toMatchObject({ attempt: 2, mode: "recovery", status: "running" })
})
