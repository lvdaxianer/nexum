import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createNexumCodingLoop,
  createNexumSessionService,
  NexumModelError,
  NexumRunError,
  type EventSink,
  type ModelMessage,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"

function dependencies(events: EventSink, model: ModelPort, options: Record<string, unknown> = {}) {
  return createNexumCodingLoop({
    model,
    tool: { async execute() { return { ok: true, output: "unused" } } },
    permission: { async evaluate() { return "allow" } },
    sessions: options.sessions as ReturnType<typeof createNexumSessionService>,
    events,
    ...options,
  })
}

async function createSession() {
  const directory = await mkdtemp(join(tmpdir(), "nexum-run-lifecycle-"))
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  return { directory, session, sessions }
}

test("reserves a running session before start returns so deletion cannot win admission", async () => {
  const { directory, session, sessions } = await createSession()
  let releaseExecution: (() => void) | undefined
  const executionBlocked = new Promise<void>((resolve) => {
    releaseExecution = resolve
  })
  const loop = dependencies(
    { async publish() {} },
    {
      async *prompt() {
        await executionBlocked
        yield { type: "text", content: "完成" }
        yield { type: "completed" }
      },
    },
    { sessions, maxModelRetries: 0 },
  )

  const started = loop.start!({ sessionID: session.sessionID, text: "开始任务" })
  expect(started.accepted).toBe(true)
  await expect(sessions.delete(session.sessionID)).rejects.toMatchObject({ code: "session_busy" })

  releaseExecution?.()
  if (!started.accepted) throw new Error("运行未被接受")
  await expect(started.promise).resolves.toMatchObject({ status: "completed" })
  await rm(directory, { recursive: true, force: true })
})

test("exposes admission separately from the execution promise", async () => {
  const { directory, session, sessions: baseSessions } = await createSession()
  let releaseAdmission!: () => void
  const admissionReleased = new Promise<void>((resolve) => {
    releaseAdmission = resolve
  })
  let executed = false
  const sessions = {
    ...baseSessions,
    async setStatus(sessionID: string, status: Parameters<typeof baseSessions.setStatus>[1]) {
      await admissionReleased
      return baseSessions.setStatus(sessionID, status)
    },
  }
  const loop = dependencies(
    { async publish() {} },
    {
      async *prompt() {
        executed = true
        yield { type: "text", content: "完成" }
        yield { type: "completed" }
      },
    },
    { sessions },
  )

  const started = loop.start!({ sessionID: session.sessionID, text: "开始任务" })
  expect(started.accepted).toBe(true)
  if (!started.accepted) throw new Error("运行未被接受")

  await Promise.resolve()
  expect(executed).toBe(false)
  expect(started.admission).toBeDefined()
  releaseAdmission()

  await expect(started.admission).resolves.toMatchObject({ status: "running" })
  await expect(started.promise).resolves.toMatchObject({ status: "completed" })
  expect(executed).toBe(true)
  await rm(directory, { recursive: true, force: true })
})

test("publishes terminal events before allowing session deletion", async () => {
  const { directory, session, sessions } = await createSession()
  const events: string[] = []
  let releaseTerminal!: () => void
  let markTerminalStarted!: () => void
  const terminalStarted = new Promise<void>((resolve) => {
    markTerminalStarted = resolve
  })
  const terminalReleased = new Promise<void>((resolve) => {
    releaseTerminal = resolve
  })
  const loop = dependencies(
    {
      async publish(event) {
        events.push(event.type)
        if (event.type !== "session.completed") return
        markTerminalStarted()
        await terminalReleased
      },
    },
    {
      async *prompt() {
        yield { type: "text", content: "完成" }
        yield { type: "completed" }
      },
    },
    { sessions },
  )

  const run = loop.run({ sessionID: session.sessionID, text: "终态事件" })
  await terminalStarted
  expect((await sessions.get(session.sessionID))?.status).toBe("running")
  await expect(sessions.delete(session.sessionID)).rejects.toMatchObject({ code: "session_busy" })

  releaseTerminal()
  await expect(run).resolves.toMatchObject({ status: "completed" })
  expect(events).toEqual(["model.attempt", "assistant.text", "session.completed", "run.settled"])
  await sessions.delete(session.sessionID)
  expect(await sessions.get(session.sessionID)).toBeUndefined()
  await rm(directory, { recursive: true, force: true })
})

test("finalizing publishes terminal events before allowing session deletion", async () => {
  const { directory, session, sessions } = await createSession()
  let modelCalls = 0
  let releaseTerminal!: () => void
  let markTerminalStarted!: () => void
  const terminalStarted = new Promise<void>((resolve) => {
    markTerminalStarted = resolve
  })
  const terminalReleased = new Promise<void>((resolve) => {
    releaseTerminal = resolve
  })
  const loop = dependencies(
    {
      async publish(event) {
        if (event.type !== "session.completed") return
        markTerminalStarted()
        await terminalReleased
      },
    },
    {
      async *prompt() {
        modelCalls += 1
        if (modelCalls === 1) {
          yield { type: "tool-call", toolCallID: "call_finalizing", toolName: "read", toolInput: { path: "a.txt" } }
          return
        }
        yield { type: "tool-call", toolCallID: "call_graceful", toolName: "read", toolInput: { path: "b.txt" } }
      },
    },
    { sessions, maxSteps: 1 },
  )

  const run = loop.run({ sessionID: session.sessionID, text: "触发收尾" })
  await terminalStarted
  expect((await sessions.get(session.sessionID))?.status).toBe("running")
  await expect(sessions.delete(session.sessionID)).rejects.toMatchObject({ code: "session_busy" })

  releaseTerminal()
  await expect(run).resolves.toMatchObject({ status: "completed" })
  await sessions.delete(session.sessionID)
  expect(await sessions.get(session.sessionID)).toBeUndefined()
  await rm(directory, { recursive: true, force: true })
})

test("settles the session even when terminal event publishing fails", async () => {
  const { directory, session, sessions } = await createSession()
  const loop = dependencies(
    {
      async publish(event) {
        if (event.type === "session.completed") throw new Error("事件存储失败")
      },
    },
    {
      async *prompt() {
        yield { type: "text", content: "完成" }
        yield { type: "completed" }
      },
    },
    { sessions },
  )

  await expect(loop.run({ sessionID: session.sessionID, text: "事件失败" })).resolves.toMatchObject({ status: "completed" })
  expect((await sessions.get(session.sessionID))?.status).toBe("completed")
  await rm(directory, { recursive: true, force: true })
})

test("publishes one settled event after a model timeout", async () => {
  const { directory, session, sessions } = await createSession()
  const events: Array<{ type: string; data?: Record<string, unknown> }> = []
  const model: ModelPort = { async *prompt() { await new Promise(() => {}) } }
  const loop = dependencies(
    { async publish(event) { events.push({ type: event.type, data: event.data }) } },
    model,
    { sessions, modelTimeoutMs: 10, runTimeoutMs: 200, maxModelRetries: 0 },
  )

  await expect(loop.run({ sessionID: session.sessionID, text: "超时任务" })).rejects.toMatchObject({ code: "timeout" })
  expect(events.map((event) => event.type)).toEqual(["model.attempt", "session.failed", "run.settled"])
  expect(events.at(-1)?.data).toEqual({ result: "failed" })
  expect((await sessions.get(session.sessionID))?.status).toBe("failed")
  await rm(directory, { recursive: true, force: true })
})

test("treats the run deadline as a failed timeout instead of cancellation", async () => {
  const { directory, session, sessions } = await createSession()
  const events: string[] = []
  const model: ModelPort = { async *prompt() { await new Promise(() => {}) } }
  const loop = dependencies(
    { async publish(event) { events.push(event.type) } },
    model,
    { sessions, runTimeoutMs: 10, maxModelRetries: 0 },
  )

  const result = await loop.run({ sessionID: session.sessionID, text: "运行截止" }).catch((error) => error)

  expect(result).toMatchObject({ code: "timeout" })
  expect(events).toEqual(["model.attempt", "session.failed", "run.settled"])
  expect((await sessions.get(session.sessionID))?.status).toBe("failed")
  await rm(directory, { recursive: true, force: true })
})

test("times out a hanging tool without accepting its late result", async () => {
  const { directory, session, sessions } = await createSession()
  let executed = 0
  const model: ModelPort = {
    async *prompt() {
      yield { type: "tool-call", toolCallID: "call_timeout", toolName: "shell", toolInput: {} }
    },
  }
  const tool: ToolPort = {
    async execute() {
      executed += 1
      await new Promise(() => {})
      return { ok: true, output: "late" }
    },
  }
  const events: string[] = []
  const loop = createNexumCodingLoop({
    model,
    tool,
    permission: { async evaluate() { return "allow" } } satisfies PermissionPort,
    sessions,
    events: { async publish(event) { events.push(event.type) } },
    toolTimeoutMs: 10,
    maxModelRetries: 0,
  })

  await expect(loop.run({ sessionID: session.sessionID, text: "工具超时" })).rejects.toMatchObject({ code: "timeout" })
  expect(executed).toBe(1)
  expect(events).toEqual(["model.attempt", "tool.request", "session.failed", "run.settled"])
  await rm(directory, { recursive: true, force: true })
})

test("cancels retry backoff without starting another model attempt", async () => {
  const { directory, session, sessions } = await createSession()
  let attempts = 0
  let retry: (() => void) | undefined
  const retryObserved = new Promise<void>((resolve) => { retry = resolve })
  const model: ModelPort = {
    async *prompt() {
      attempts += 1
      throw new NexumModelError("rate_limited", "限流")
    },
  }
  const loop = dependencies(
    {
      async publish(event) {
        if (event.type === "model.retry") retry?.()
      },
    },
    model,
    { sessions, retryDelayMs: 250, maxModelRetries: 1 },
  )

  const run = loop.run({ sessionID: session.sessionID, text: "取消退避" })
  await retryObserved
  const startedAt = Date.now()
  const cancelled = await loop.cancel(session.sessionID)
  const result = await run

  expect(Date.now() - startedAt).toBeLessThan(100)
  expect(attempts).toBe(1)
  expect(cancelled.status).toBe("cancelled")
  expect(result.status).toBe("cancelled")
  await rm(directory, { recursive: true, force: true })
})

test("continues a failed run from the existing user context without duplicating it", async () => {
  const { directory, session, sessions } = await createSession()
  const prompts: Array<readonly ModelMessage[]> = []
  let calls = 0
  const model: ModelPort = {
    async *prompt(input) {
      calls += 1
      prompts.push(input.messages ?? [])
      if (calls === 1) throw new Error("模型暂时失败")
      yield { type: "text", content: "继续成功" }
      yield { type: "completed" }
    },
  }
  const loop = dependencies(
    { async publish() {} },
    model,
    { sessions },
  )

  await expect(loop.run({ sessionID: session.sessionID, text: "原始任务" })).rejects.toThrow("模型暂时失败")
  await expect(loop.canContinue!(session.sessionID)).resolves.toBe(true)
  await expect(loop.continue!(session.sessionID)).resolves.toMatchObject({ status: "completed" })

  expect(prompts[1]).toEqual([{ role: "user", content: "原始任务" }])
  expect(calls).toBe(2)
  await rm(directory, { recursive: true, force: true })
})

test("continues a failed run from the last tool result", async () => {
  const { directory, session, sessions } = await createSession()
  let calls = 0
  const prompts: Array<readonly ModelMessage[]> = []
  const model: ModelPort = {
    async *prompt(input) {
      calls += 1
      prompts.push(input.messages ?? [])
      if (calls === 1) {
        yield { type: "tool-call", toolCallID: "call_continue", toolName: "read", toolInput: { path: "README.md" } }
        return
      }
      if (calls === 2) throw new Error("工具结果后的模型失败")
      yield { type: "text", content: "工具结果后继续成功" }
      yield { type: "completed" }
    },
  }
  const loop = createNexumCodingLoop({
    model,
    tool: { async execute() { return { ok: true, output: "README 内容" } } },
    permission: { async evaluate() { return "allow" } },
    sessions,
    events: { async publish() {} },
  })

  await expect(loop.run({ sessionID: session.sessionID, text: "读取 README" })).rejects.toThrow("工具结果后的模型失败")
  await expect(loop.continue!(session.sessionID)).resolves.toMatchObject({ status: "completed" })

  expect(prompts[2]).toEqual([
    { role: "user", content: "读取 README" },
    { role: "assistant", toolCalls: [{ id: "call_continue", name: "read", input: { path: "README.md" } }] },
    { role: "tool", toolCallID: "call_continue", content: "README 内容" },
  ])
  await rm(directory, { recursive: true, force: true })
})

test("serializes concurrent continuation admissions for one session", async () => {
  const { directory, session, sessions } = await createSession()
  let calls = 0
  let release: (() => void) | undefined
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const loop = dependencies(
    { async publish() {} },
    {
      async *prompt() {
        calls += 1
        if (calls === 1) throw new Error("首次运行失败")
        await blocked
        yield { type: "text", content: "继续完成" }
        yield { type: "completed" }
      },
    },
    { sessions },
  )

  await expect(loop.run({ sessionID: session.sessionID, text: "并发继续" })).rejects.toThrow("首次运行失败")
  const first = await loop.continueStart!(session.sessionID)
  const second = await loop.continueStart!(session.sessionID)

  expect(first.accepted).toBe(true)
  expect(second).toEqual({ accepted: false, reason: "session_busy" })
  if (!first.accepted) throw new Error("首次 Continue 未受理")
  release?.()
  await first.promise
  await rm(directory, { recursive: true, force: true })
})

test("rejects continue when the history ends with an assistant answer", async () => {
  const { directory, session, sessions } = await createSession()
  let calls = 0
  const model: ModelPort = {
    async *prompt() {
      calls += 1
      yield { type: "text", content: "已完成" }
      yield { type: "completed" }
    },
  }
  const loop = dependencies({ async publish() {} }, model, { sessions })

  await loop.run({ sessionID: session.sessionID, text: "完成任务" })
  await expect(loop.canContinue!(session.sessionID)).resolves.toBe(false)
  await expect(loop.continue!(session.sessionID)).rejects.toBeInstanceOf(NexumRunError)
  expect(calls).toBe(1)
  await rm(directory, { recursive: true, force: true })
})
