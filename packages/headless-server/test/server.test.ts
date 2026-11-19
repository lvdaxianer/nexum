import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createHeadlessModelConfigStore,
  createHeadlessPermissionBroker,
  createHeadlessSessionService,
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
  expect(await cancelResponse.json()).toEqual({ data: { status: "cancelled" } })
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

  expect(text).toContain("id: 1")
  expect(text).toContain('"type":"session.started"')
  expect(text).toContain('"status":"running"')
  await reader.cancel()
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
  expect(await listResponse.json()).toEqual({ data: [] })

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
  expect(await getResponse.json()).toEqual({ data: updateBody.data })
})

test("headless-server package stays independent from UI packages", async () => {
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})
