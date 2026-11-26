import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type ModelPort,
  type NexumExecutionStore,
  type ModelMessage,
} from "../src/index.ts"
import { createInMemoryExecutionStore } from "../../nexum-persistence/src/execution-store.ts"
import { createInMemoryMessageStore } from "../../nexum-persistence/src/message-store.ts"
import { createNexumCodingLoop, createNexumSessionService } from "./test-ports.ts"

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("等待恢复运行超时")
}

function modelThatCompletes(onPrompt?: (messages: readonly ModelMessage[]) => void): ModelPort {
  return {
    async *prompt(input) {
      onPrompt?.(input.messages ?? [])
      yield { type: "text", content: "恢复完成" }
      yield { type: "completed" }
    },
  }
}

function loopDependencies(
  sessions: ReturnType<typeof createNexumSessionService>,
  messageStore: ReturnType<typeof createInMemoryMessageStore>,
  executionStore: NexumExecutionStore,
  model: ModelPort,
) {
  return createNexumCodingLoop({
    model,
    tool: { async execute() { return { ok: true, output: "unused" } } },
    permission: { async evaluate() { return "allow" } },
    sessions,
    events: { async publish() {} },
    messageStore,
    executionStore,
    maxModelRetries: 0,
  })
}

test("recovers a stale running execution without duplicating the canonical user message", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-execution-recovery-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createInMemoryMessageStore()
  await messageStore.save(session.sessionID, [{ role: "user", content: "继续处理" }])
  const executionStore = createInMemoryExecutionStore()
  const executionID = "exec_recover"
  await executionStore.claim({ executionID, sessionID: session.sessionID, mode: "prompt", maxAttempts: 3 })
  const prompts: (readonly ModelMessage[])[] = []
  const loop = loopDependencies(sessions, messageStore, executionStore, modelThatCompletes((messages) => prompts.push(messages)))

  await loop.recover!()
  await waitFor(async () => (await sessions.get(session.sessionID))?.status === "completed")

  expect(prompts).toHaveLength(1)
  expect(prompts[0]?.filter((message) => message.role === "user")).toEqual([{ role: "user", content: "继续处理" }])
  expect((await executionStore.list())[0]).toMatchObject({ executionID, attempt: 2, status: "completed" })
  await rm(directory, { recursive: true, force: true })
})

test("marks a non-continuable stale execution as waiting without calling the model", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-execution-waiting-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createInMemoryMessageStore()
  await messageStore.save(session.sessionID, [{ role: "assistant", content: "已完成" }])
  const executionStore = createInMemoryExecutionStore()
  await executionStore.claim({ executionID: "exec_waiting", sessionID: session.sessionID, mode: "prompt", maxAttempts: 3 })
  let modelCalls = 0
  const loop = loopDependencies(sessions, messageStore, executionStore, modelThatCompletes(() => { modelCalls += 1 }))

  await loop.recover!()

  expect(modelCalls).toBe(0)
  expect(await executionStore.get("exec_waiting")).toMatchObject({ status: "recovery_waiting", errorCode: "not_continuable" })
  await rm(directory, { recursive: true, force: true })
})

test("exhausts recovery attempts before starting another model call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-execution-exhausted-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createInMemoryMessageStore()
  await messageStore.save(session.sessionID, [{ role: "user", content: "重试任务" }])
  const executionStore = createInMemoryExecutionStore()
  await executionStore.claim({ executionID: "exec_exhausted", sessionID: session.sessionID, mode: "prompt", maxAttempts: 1 })
  let modelCalls = 0
  const loop = loopDependencies(sessions, messageStore, executionStore, modelThatCompletes(() => { modelCalls += 1 }))

  await loop.recover!()

  expect(modelCalls).toBe(0)
  expect(await executionStore.get("exec_exhausted")).toMatchObject({ status: "recovery_exhausted", errorCode: "attempt_limit" })
  await rm(directory, { recursive: true, force: true })
})

test("continues recovering other sessions when one stale claim is invalid", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-execution-isolation-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const messageStore = createInMemoryMessageStore()
  await messageStore.save(session.sessionID, [{ role: "user", content: "有效任务" }])
  const executionStore = createInMemoryExecutionStore()
  await executionStore.claim({ executionID: "exec_bad", sessionID: "missing", mode: "prompt", maxAttempts: 3 })
  await executionStore.claim({ executionID: "exec_good", sessionID: session.sessionID, mode: "prompt", maxAttempts: 3 })
  let modelCalls = 0
  const loop = loopDependencies(sessions, messageStore, executionStore, modelThatCompletes(() => { modelCalls += 1 }))

  await loop.recover!()
  await waitFor(async () => (await sessions.get(session.sessionID))?.status === "completed")

  expect(modelCalls).toBe(1)
  expect(await executionStore.get("exec_bad")).toMatchObject({ status: "recovery_waiting", errorCode: "session_not_found" })
  await rm(directory, { recursive: true, force: true })
})
