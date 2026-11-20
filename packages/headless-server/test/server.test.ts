import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createHeadlessCodingLoop,
  createHeadlessModelConfigStore,
  createHeadlessPermissionBroker,
  createHeadlessQuestionPort,
  createHeadlessSessionService,
  type ContextCompactionPort,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "@opencode/headless-core"
import { createHeadlessEventHub } from "../src/events.ts"
import { startHeadlessServer, type HeadlessServer } from "../src/index.ts"

const FORBIDDEN_UI_PACKAGES = ["@opencode/app", "@opencode/tui", "@opencode/desktop", "@opencode/cli"]
const servers: HeadlessServer[] = []
const upstreamServers: Array<ReturnType<typeof Bun.serve>> = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(upstreamServers.splice(0).map((server) => server.stop(true)))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("headless server starts independently and exposes liveness and readiness", async () => {
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const liveResponse = await fetch(new URL("/health/live", server.url))
  const readyResponse = await fetch(new URL("/health/ready", server.url))
  const tracedResponse = await fetch(new URL("/health/live", server.url), {
    headers: { "x-trace-id": "client_trace_001" },
  })

  expect(liveResponse.status).toBe(200)
  expect(readyResponse.status).toBe(200)
  expect(tracedResponse.headers.get("x-trace-id")).toBe("client_trace_001")
  expect(liveResponse.headers.get("x-trace-id")).toBeString()
  expect(await liveResponse.json()).toEqual({
    service: "headless-server",
    status: "ok",
  })
  expect(await readyResponse.json()).toEqual({
    service: "headless-server",
    status: "ready",
  })
})

test("allows the local headless UI origin and answers CORS preflight", async () => {
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const preflight = await fetch(new URL("/api/experimental/headless/session", server.url), {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5173",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  })
  const response = await fetch(new URL("/health/live", server.url), {
    headers: { origin: "http://127.0.0.1:5173" },
  })

  expect(preflight.status).toBe(204)
  expect(preflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173")
  expect(preflight.headers.get("access-control-allow-methods")).toContain("POST")
  expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173")
})

test("unknown routes return a stable caller-safe error", async () => {
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/unknown", server.url))
  const body = (await response.json()) as {
    errorCode: string
    message: string
    traceId: string
  }
  const traceId = response.headers.get("x-trace-id")

  if (!traceId) throw new Error("响应缺少 x-trace-id")

  expect(response.status).toBe(404)
  expect(body.errorCode).toBe("HEADLESS_ROUTE_NOT_FOUND")
  expect(body.message).toBe("请求路径不存在")
  expect(body.traceId).toBe(traceId)
})

test("creates a session through the independent headless service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-session-"))
  temporaryDirectories.push(directory)
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/headless/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const body = (await response.json()) as { data: { id: string; directory: string; status: string } }

  expect(response.status).toBe(200)
  expect(body.data).toMatchObject({ directory, status: "idle" })
  expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/)
})

test("lists sessions for page-level recovery", async () => {
  const firstDirectory = await mkdtemp(join(tmpdir(), "headless-server-list-first-"))
  const secondDirectory = await mkdtemp(join(tmpdir(), "headless-server-list-second-"))
  temporaryDirectories.push(firstDirectory, secondDirectory)
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  for (const directory of [firstDirectory, secondDirectory]) {
    const response = await fetch(new URL("/api/experimental/headless/session", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    expect(response.status).toBe(200)
  }

  const response = await fetch(new URL("/api/experimental/headless/session", server.url))
  const body = (await response.json()) as { data: Array<{ id: string; directory: string; status: string }> }

  expect(response.status).toBe(200)
  expect(body.data.map((item) => item.directory)).toEqual([firstDirectory, secondDirectory])
  expect(body.data.every((item) => item.status === "idle")).toBe(true)
})

test("probes the configured model without returning model content or credentials", async () => {
  const server = await startHeadlessServer({
    port: 0,
    modelProbe: {
      async probe(input) {
        expect(input).toEqual({ mode: "both" })
        return { text: "pass", functionCalling: "pass" }
      },
    },
  })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/headless/model/probe", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "both" }),
  })
  const body = (await response.json()) as { data: { text: string; functionCalling: string } }

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ data: { text: "pass", functionCalling: "pass" }, meta: { protocolVersion: "headless.v1" } })
  expect(JSON.stringify(body)).not.toContain("credential")
})

test("rejects an invalid model probe mode with a stable error", async () => {
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/headless/model/probe", server.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-trace-id": "probe_invalid_trace" },
    body: JSON.stringify({ mode: "secret" }),
  })
  const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

  expect(response.status).toBe(400)
  expect(body.errorCode).toBe("HEADLESS_INVALID_MODEL_PROBE")
  expect(body.traceId).toBe("probe_invalid_trace")
})

test("rejects an invalid session directory at the HTTP boundary", async () => {
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/experimental/headless/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-trace-id": "session_create_trace" },
    body: JSON.stringify({ directory: join(tmpdir(), `missing-headless-server-directory-${crypto.randomUUID()}`) }),
  })
  const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

  expect(response.status).toBe(400)
  expect(body.errorCode).toBe("HEADLESS_INVALID_DIRECTORY")
  expect(body.traceId).toBe("session_create_trace")
  expect(body.message).toBeString()
})

test("accepts a prompt and delegates it to the injected coding loop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-prompt-"))
  temporaryDirectories.push(directory)
  const sessionService = createHeadlessSessionService()
  const session = await sessionService.create({ directory })
  const prompts: Array<{ sessionID: string; text: string }> = []
  const server = await startHeadlessServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        prompts.push(input)
        return (await sessionService.get(input.sessionID))!
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(new URL(`/api/experimental/headless/session/${session.sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "请读取 README.md" }),
  })
  const body = (await response.json()) as { data: { status: string } }

  expect(response.status).toBe(200)
  expect(body.data).toEqual({ status: "accepted" })
  expect(prompts).toEqual([{ sessionID: session.sessionID, text: "请读取 README.md" }])

  const cancelResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/cancel`, server.url),
    {
      method: "POST",
    },
  )
  expect(cancelResponse.status).toBe(200)
  expect(await cancelResponse.json()).toMatchObject({ data: { status: "cancelled" }, meta: { protocolVersion: "headless.v1" } })
})

test("composes the default coding loop when no runtime is injected", async () => {
  const modelRequests: string[] = []
  const upstream = Bun.serve({
    port: 0,
    async fetch(request) {
      modelRequests.push(await request.text())
      return Response.json({ choices: [{ message: { content: "default runtime is alive" } }] })
    },
  })
  upstreamServers.push(upstream)
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const modelResponse = await fetch(new URL("/api/experimental/headless/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl: upstream.url.toString().replace(/\/$/, ""), model: "poc-model" }),
  })
  expect(modelResponse.status).toBe(200)

  const directory = await mkdtemp(join(tmpdir(), "headless-server-default-runtime-"))
  temporaryDirectories.push(directory)
  const sessionResponse = await fetch(new URL("/api/experimental/headless/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const sessionBody = (await sessionResponse.json()) as { data: { id: string } }
  const eventsResponse = await fetch(
    new URL(`/api/experimental/headless/session/${sessionBody.data.id}/events`, server.url),
  )
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()

  const promptResponse = await fetch(
    new URL(`/api/experimental/headless/session/${sessionBody.data.id}/prompt`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "请输出运行状态" }),
    },
  )
  expect(promptResponse.status).toBe(200)

  let eventText = ""
  const decoder = new TextDecoder()
  for (let attempt = 0; attempt < 4 && !eventText.includes('"type":"session.completed"'); attempt++) {
    const event = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("默认 Runtime 事件读取超时")), 1_000)),
    ])
    eventText += decoder.decode(event.value)
  }
  expect(eventText).toContain('"type":"assistant.text"')
  expect(eventText).toContain("default runtime is alive")
  expect(eventText).toContain('"type":"session.completed"')
  expect(modelRequests).toHaveLength(1)
  await reader.cancel()
})

test("completes a function-calling task after an allow-once permission reply", async () => {
  const modelRequests: Array<Record<string, unknown>> = []
  const upstream = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = JSON.parse(await request.text()) as Record<string, unknown>
      modelRequests.push(body)
      if (modelRequests.length === 1) {
        return Response.json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_write_001",
                    type: "function",
                    function: {
                      name: "write",
                      arguments: JSON.stringify({ path: "notes.txt", content: "hello from function calling" }),
                    },
                  },
                ],
              },
            },
          ],
        })
      }

      return Response.json({ choices: [{ message: { content: "文件已写入" } }] })
    },
  })
  upstreamServers.push(upstream)
  const server = await startHeadlessServer({ port: 0 })
  servers.push(server)

  const modelResponse = await fetch(new URL("/api/experimental/headless/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl: upstream.url.toString().replace(/\/$/, ""), model: "fixture-model" }),
  })
  expect(modelResponse.status).toBe(200)

  const directory = await mkdtemp(join(tmpdir(), "headless-server-function-calling-"))
  temporaryDirectories.push(directory)
  const sessionResponse = await fetch(new URL("/api/experimental/headless/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const sessionBody = (await sessionResponse.json()) as { data: { id: string } }
  const sessionID = sessionBody.data.id
  const eventsResponse = await fetch(new URL(`/api/experimental/headless/session/${sessionID}/events`, server.url))
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()

  const promptResponse = await fetch(new URL(`/api/experimental/headless/session/${sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "请写入 notes.txt" }),
  })
  expect(promptResponse.status).toBe(200)

  const toolEventText = await readSseUntil(reader, '"type":"tool.request"')
  expect(toolEventText).toContain('"toolCallID":"call_write_001"')

  const permissionListResponse = await fetch(
    new URL(`/api/experimental/headless/session/${sessionID}/permission`, server.url),
  )
  const permissionBody = (await permissionListResponse.json()) as {
    data: Array<{ id: string; action: string; resource: string }>
  }
  expect(permissionBody.data).toHaveLength(1)
  expect(permissionBody.data[0]).toMatchObject({ action: "write", resource: "notes.txt" })

  const replyResponse = await fetch(
    new URL(
      `/api/experimental/headless/session/${sessionID}/permission/${permissionBody.data[0]!.id}/reply`,
      server.url,
    ),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "allow_once" }),
    },
  )
  expect(replyResponse.status).toBe(200)

  const completionText = await readSseUntil(reader, '"type":"session.completed"')
  const notes = await Bun.file(join(directory, "notes.txt")).text()
  expect(notes).toBe("hello from function calling")
  expect(completionText).toContain('"type":"tool.result"')
  expect(completionText).toContain('"type":"assistant.text"')
  expect(completionText).toContain("文件已写入")
  expect(modelRequests).toHaveLength(2)
  expect(modelRequests[1]?.messages).toEqual([
    { role: "user", content: "请写入 notes.txt" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_write_001",
          type: "function",
          function: {
            name: "write",
            arguments: JSON.stringify({ path: "notes.txt", content: "hello from function calling" }),
          },
        },
      ],
    },
    { role: "tool", tool_call_id: "call_write_001", content: "" },
  ])
  await reader.cancel()
})

test("streams ordered session events over SSE", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-events-"))
  temporaryDirectories.push(directory)
  const sessionService = createHeadlessSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createHeadlessEventHub()
  const server = await startHeadlessServer({ port: 0, sessionService, eventHub })
  servers.push(server)

  const response = await fetch(new URL(`/api/experimental/headless/session/${session.sessionID}/events`, server.url), {
    headers: { "x-trace-id": "events_trace_001" },
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  expect(response.headers.get("x-trace-id")).toBe("events_trace_001")

  const connectedChunk = await reader.read()
  expect(new TextDecoder().decode(connectedChunk.value)).toContain("headless-events-connected")

  const read = reader.read()
  await eventHub.publish({
    type: "session.started",
    sessionID: session.sessionID,
    sequence: 1,
    data: { status: "running" },
  })
  const chunk = await Promise.race([
    read,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE 事件读取超时")), 1_000)),
  ])
  const text = new TextDecoder().decode(chunk.value)

  expect(text).toMatch(/id: [^\n]+/)
  expect(text).toContain("event: session.started")
  expect(text).toContain('"type":"session.started"')
  expect(text).toContain('"status":"running"')
  await reader.cancel()
  await eventHub.publish({
    type: "session.completed",
    sessionID: session.sessionID,
    sequence: 2,
  })
  await Bun.sleep(10)
})

async function readSseUntil(
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "read">,
  marker: string,
): Promise<string> {
  let text = ""
  const decoder = new TextDecoder()
  for (let attempt = 0; attempt < 12 && !text.includes(marker); attempt++) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`SSE 事件读取超时: ${marker}`)), 1_000)),
    ])
    text += decoder.decode(chunk.value ?? new Uint8Array())
  }
  if (!text.includes(marker)) throw new Error(`SSE 未收到目标事件: ${marker}`)
  return text
}

test("serves Question replies and streams tool plus context compaction completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-question-chain-"))
  temporaryDirectories.push(directory)
  const sessionService = createHeadlessSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createHeadlessEventHub()
  const questionPort = createHeadlessQuestionPort()
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  let step = 0
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      step += 1
      if (step === 1) {
        yield {
          type: "question",
          questionID: "question_chain_001",
          toolCallID: "call_question_chain_001",
          questions: [
            {
              header: "目录",
              question: "选择目录",
              options: [{ label: "src", description: "源代码目录" }],
            },
          ],
        }
        return
      }
      if (step === 2) {
        yield {
          type: "tool-call",
          toolCallID: "call_read_chain_001",
          toolName: "read",
          toolInput: { path: "README.md" },
        }
        return
      }
      yield { type: "completed" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "README 内容" }
    },
  }
  const compaction: ContextCompactionPort = {
    estimate: (messages) =>
      messages.some((message) => message.role === "tool" && message.toolCallID === "call_read_chain_001") ? 100 : 1,
    async compact() {
      return { summary: "Question 与工具链已完成", recentMessages: [], context: [] }
    },
  }
  const events: EventSink = eventHub
  const codingLoop = createHeadlessCodingLoop({
    model,
    tool,
    permission,
    sessions: sessionService,
    events,
    question: questionPort,
    contextCompaction: compaction,
    compactionThreshold: 10,
  })
  const server = await startHeadlessServer({
    port: 0,
    sessionService,
    eventHub,
    codingLoop,
    questionPort,
  })
  servers.push(server)

  const eventsResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/events`, server.url),
  )
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()
  const promptResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/prompt`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "先确认目录，再读取 README.md" }),
    },
  )
  expect(promptResponse.status).toBe(200)

  const questionEventText = await readSseUntil(reader, '"type":"question.request"')
  expect(questionEventText).toContain('"requestID":"question_chain_001"')
  const listResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/question`, server.url),
  )
  const pending = (await listResponse.json()) as { data: Array<{ id: string; questions: unknown[] }> }
  expect(pending.data).toHaveLength(1)
  expect(pending.data[0]).toMatchObject({ id: "question_chain_001" })

  const replyResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/question/question_chain_001/reply`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [["src"]] }),
    },
  )
  expect(replyResponse.status).toBe(200)
  expect(await replyResponse.json()).toMatchObject({ data: { status: "answered" }, meta: { protocolVersion: "headless.v1" } })

  const completionText = await readSseUntil(reader, '"type":"session.completed"')
  expect(completionText).toContain('"type":"question.result"')
  expect(completionText).toContain('"type":"tool.request"')
  expect(completionText).toContain('"type":"tool.result"')
  expect(completionText).toContain('"type":"context.compaction.started"')
  expect(completionText).toContain('"type":"context.compaction.completed"')
  expect(prompts[2]?.messages).toEqual([
    { role: "system", content: "Context summary:\nQuestion 与工具链已完成", sourceID: "context:summary" },
  ])
  await reader.cancel()
})

test("cancels a pending Question through the HTTP boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-question-cancel-"))
  temporaryDirectories.push(directory)
  const sessionService = createHeadlessSessionService()
  const session = await sessionService.create({ directory })
  const questionPort = createHeadlessQuestionPort()
  const pending = questionPort.ask({
    id: "question_cancel_001",
    sessionID: session.sessionID,
    toolCallID: "call_question_cancel_001",
    questions: [{ header: "确认", question: "继续吗", options: [{ label: "是", description: "继续" }] }],
  })
  const server = await startHeadlessServer({ port: 0, sessionService, questionPort })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/question/question_cancel_001/cancel`, server.url),
    { method: "POST" },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: { status: "cancelled" }, meta: { protocolVersion: "headless.v1" } })
  await expect(pending).resolves.toEqual({ ok: false, output: "问题已取消" })
})

test("lists pending permissions and returns stable approval errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "headless-server-permission-"))
  temporaryDirectories.push(directory)
  const sessionService = createHeadlessSessionService()
  const session = await sessionService.create({ directory })
  const permissionBroker = createHeadlessPermissionBroker()
  const server = await startHeadlessServer({ port: 0, sessionService, permissionBroker })
  servers.push(server)

  const listResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/permission`, server.url),
  )
  expect(listResponse.status).toBe(200)
  expect(await listResponse.json()).toMatchObject({ data: [], meta: { protocolVersion: "headless.v1" } })

  const replyResponse = await fetch(
    new URL(`/api/experimental/headless/session/${session.sessionID}/permission/unknown/reply`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "allow_once" }),
    },
  )
  const replyBody = (await replyResponse.json()) as { errorCode: string; message: string }
  expect(replyResponse.status).toBe(404)
  expect(replyBody.errorCode).toBe("HEADLESS_PERMISSION_NOT_FOUND")
  expect(replyBody.message).toBe("权限请求不存在")
})

test("stores model configuration without returning its credential", async () => {
  const modelConfigStore = createHeadlessModelConfigStore()
  const server = await startHeadlessServer({ port: 0, modelConfigStore })
  servers.push(server)

  const updateResponse = await fetch(new URL("/api/experimental/headless/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://model.example.com/v1",
      model: "coding-model",
      credential: "super-secret-value",
    }),
  })
  const updateBody = (await updateResponse.json()) as { data: Record<string, unknown> }
  expect(updateResponse.status).toBe(200)
  expect(updateBody.data).toEqual({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credentialConfigured: true,
  })
  expect(JSON.stringify(updateBody)).not.toContain("super-secret-value")

  const invalidResponse = await fetch(new URL("/api/experimental/headless/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl: "invalid", model: "next-model" }),
  })
  expect(invalidResponse.status).toBe(400)

  const getResponse = await fetch(new URL("/api/experimental/headless/model", server.url))
  expect(getResponse.status).toBe(200)
  expect(await getResponse.json()).toMatchObject({ data: updateBody.data, meta: { protocolVersion: "headless.v1" } })
})

test("headless-server package stays independent from UI packages", async () => {
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})
