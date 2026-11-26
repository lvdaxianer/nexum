import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  NEXUM_DEFAULT_ROLE_PROMPT,
  NexumSessionError,
  type MessageStore,
  type SessionRecord,
  type SessionStore,
  type ContextCompactionPort,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "@nexum/core"
import { createNexumCodingLoop, createNexumPermissionBroker, createNexumSessionService } from "./test-ports.ts"
import {
  createFileInteractionStore,
  createFileSessionStore,
} from "@nexum/persistence-file"
import {
  createInMemoryMessageStore,
  createInMemorySessionStore,
  createMemoryPersistence,
  createNexumModelConfigStore,
} from "@nexum/persistence-memory"
import { createNexumQuestionPort } from "@nexum/application"
import { createNexumEventHub } from "../src/events.ts"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const FORBIDDEN_SURFACE_PACKAGES = ["@nexum/surfaces"]
const servers: NexumServer[] = []
const upstreamServers: Array<ReturnType<typeof Bun.serve>> = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(upstreamServers.splice(0).map((server) => server.stop(true)))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("nexum server starts independently and exposes liveness and readiness", async () => {
  const server = await startNexumServer({ port: 0 })
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
    service: "nexum-server",
    status: "ok",
  })
  expect(await readyResponse.json()).toEqual({
    service: "nexum-server",
    status: "ready",
  })
})

test("requires an authentication token before binding a non-loopback host", async () => {
  await expect(startNexumServer({ hostname: "0.0.0.0", port: 0 })).rejects.toThrow("authToken")
})

test("protects non-loopback API requests with a bearer token", async () => {
  const server = await startNexumServer({ hostname: "0.0.0.0", port: 0, authToken: "test-auth-token" })
  servers.push(server)
  const apiUrl = new URL(`/api/nexum/capabilities`, `http://127.0.0.1:${server.url.port}`)

  const unauthorized = await fetch(apiUrl)
  const authorized = await fetch(apiUrl, { headers: { authorization: "Bearer test-auth-token" } })
  const live = await fetch(new URL("/health/live", apiUrl))

  expect(unauthorized.status).toBe(401)
  expect(await unauthorized.json()).toMatchObject({ errorCode: "NEXUM_AUTH_REQUIRED" })
  expect(authorized.status).toBe(200)
  expect(live.status).toBe(200)
})

test("uses SQLite by default and restores sessions after a server restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-sqlite-workspace-"))
  const dataDirectory = await mkdtemp(join(tmpdir(), "nexum-server-sqlite-data-"))
  temporaryDirectories.push(directory, dataDirectory)
  const databasePath = join(dataDirectory, "nexum.db")
  const first = await startNexumServer({ port: 0, databasePath })
  const created = await fetch(new URL("/api/nexum/session", first.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  expect(created.status).toBe(200)
  await first.stop(true)

  const second = await startNexumServer({ port: 0, databasePath })
  servers.push(second)
  const restored = await fetch(new URL("/api/nexum/session", second.url))
  expect(restored.status).toBe(200)
  const restoredBody = (await restored.json()) as { data: readonly unknown[] }
  expect(restoredBody.data).toHaveLength(1)
})

test("uses an injected persistence composition when creating the server runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-persistence-"))
  temporaryDirectories.push(directory)
  const persistence = createMemoryPersistence()
  const server = await startNexumServer({ port: 0, persistence })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })

  expect(response.status).toBe(200)
  expect(await persistence.sessionStore.list()).toHaveLength(1)
})

test("allows the local nexum UI origin and answers CORS preflight", async () => {
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const preflight = await fetch(new URL("/api/nexum/session", server.url), {
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
  const server = await startNexumServer({ port: 0 })
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
  expect(body.errorCode).toBe("NEXUM_ROUTE_NOT_FOUND")
  expect(body.message).toBe("请求路径不存在")
  expect(body.traceId).toBe(traceId)
})

test("creates a session through the independent nexum service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-session-"))
  temporaryDirectories.push(directory)
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/session", server.url), {
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
  const firstDirectory = await mkdtemp(join(tmpdir(), "nexum-server-list-first-"))
  const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-server-list-second-"))
  temporaryDirectories.push(firstDirectory, secondDirectory)
  const server = await startNexumServer({ port: 0, persistence: createMemoryPersistence() })
  servers.push(server)

  for (const directory of [firstDirectory, secondDirectory]) {
    const response = await fetch(new URL("/api/nexum/session", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    expect(response.status).toBe(200)
  }

  const response = await fetch(new URL("/api/nexum/session", server.url))
  const body = (await response.json()) as { data: Array<{ id: string; directory: string; status: string }> }

  expect(response.status).toBe(200)
  expect(new Set(body.data.map((item) => item.directory))).toEqual(new Set([firstDirectory, secondDirectory]))
  expect(body.data.every((item) => item.status === "idle")).toBe(true)
})

test("creates and updates independently named sessions", async () => {
  const firstDirectory = await mkdtemp(join(tmpdir(), "nexum-server-named-a-"))
  const secondDirectory = await mkdtemp(join(tmpdir(), "nexum-server-named-b-"))
  temporaryDirectories.push(firstDirectory, secondDirectory)
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const firstResponse = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "前端", directory: firstDirectory }),
  })
  const first = (await firstResponse.json()) as { data: { id: string; name: string; directory: string } }
  const secondResponse = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory: secondDirectory }),
  })
  const second = (await secondResponse.json()) as { data: { id: string; name: string; directory: string } }

  expect(first.data.name).toBe("前端")
  expect(second.data.name).toBeString()
  expect(second.data.directory).toBe(secondDirectory)

  const update = await fetch(new URL(`/api/nexum/session/${first.data.id}`, server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "前端应用" }),
  })
  const updateBody = (await update.json()) as { data: { id: string; name: string; directory: string } }
  expect(updateBody.data).toMatchObject({ id: first.data.id, name: "前端应用", directory: firstDirectory })
})

test("deletes one session and its durable history while preserving the work directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-delete-project-"))
  const root = await mkdtemp(join(tmpdir(), "nexum-server-delete-data-"))
  temporaryDirectories.push(directory, root)
  const sessionStore = createInMemorySessionStore()
  const sessionService = createNexumSessionService({ store: sessionStore })
  const messageStore = createInMemoryMessageStore()
  const interactionStore = createFileInteractionStore({ filePath: join(root, "interactions.json") })
  const eventHub = createNexumEventHub()
  const session = await sessionService.create({ directory, name: "待删除" })
  await messageStore.save(session.sessionID, [{ role: "user", content: "需要删除的历史" }])
  await interactionStore.save({
    requestID: "delete-permission-001",
    sessionID: session.sessionID,
    status: "orphaned",
    createdAt: "2026-11-23T00:00:00.000Z",
    updatedAt: "2026-11-23T00:00:00.000Z",
    kind: "permission",
    action: "shell",
    resource: "pwd",
  })
  await eventHub.publish({
    type: "assistant.text",
    sessionID: session.sessionID,
    sequence: 1,
    eventID: "delete-event-001",
    data: { content: "需要删除的事件" },
  })
  const server = await startNexumServer({ port: 0, sessionService, messageStore, interactionStore, eventHub })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })
  const body = (await response.json()) as { data: { id: string; deleted: boolean } }

  expect(response.status).toBe(200)
  expect(body.data).toEqual({ id: session.sessionID, deleted: true })
  expect(await sessionService.get(session.sessionID)).toBeUndefined()
  expect(await messageStore.load(session.sessionID)).toEqual([])
  expect(await interactionStore.get("delete-permission-001")).toBeUndefined()
  expect(eventHub.lastSequence(session.sessionID)).toBe(0)
  expect((await stat(directory)).isDirectory()).toBe(true)

  const repeated = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })
  expect(repeated.status).toBe(404)
  expect(((await repeated.json()) as { errorCode: string }).errorCode).toBe("NEXUM_SESSION_NOT_FOUND")
})

test("pages canonical session messages without exposing credential-shaped values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-messages-project-"))
  temporaryDirectories.push(directory)
  const sessionStore = createInMemorySessionStore()
  const sessionService = createNexumSessionService({ store: sessionStore })
  const messageStore = createInMemoryMessageStore()
  const session = await sessionService.create({ directory, name: "历史对话" })
  await messageStore.save(session.sessionID, [
    { role: "user", content: "第一条 Prompt" },
    { role: "assistant", content: "第一条回答", reasoningContent: "先检查目录" },
    {
      role: "assistant",
      toolCalls: [
        {
          id: "tool-call-001",
          name: "shell",
          input: {
            command: "pwd",
            token: "secret-value",
            nested: [{ access_token: "access-secret", client_secret: "client-secret" }],
          },
        },
      ],
    },
    {
      role: "tool",
      toolCallID: "tool-call-001",
      content: 'tool output: {"access_token":"json secret","private_key":"private secret"}',
    },
    { role: "system", sourceID: "context:summary", content: "Context summary:\n已完成目录检查" },
    { role: "system", sourceID: "runtime:default-role", content: "内部角色提示词：必须隐藏" },
    { role: "user", content: "最新 Prompt" },
  ])
  const server = await startNexumServer({ port: 0, sessionService, messageStore })
  servers.push(server)

  const firstResponse = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/messages?limit=3`, server.url),
  )
  const firstBody = (await firstResponse.json()) as {
    data: {
      messages: Array<{ index: number; message: Record<string, unknown> }>
      total: number
      hasMore: boolean
      nextBefore?: number
      snapshotID: string
    }
  }

  expect(firstResponse.status).toBe(200)
  expect(firstBody.data.total).toBe(7)
  expect(firstBody.data.snapshotID).toHaveLength(64)
  expect(firstBody.data.messages.map((item) => item.index)).toEqual([4, 5, 6])
  expect(firstBody.data.messages[0]?.message).toMatchObject({ role: "system", sourceID: "context:summary" })
  expect(firstBody.data.messages[1]?.message).toMatchObject({
    role: "system",
    sourceID: "context:hidden",
    content: "内部系统上下文未在对话历史中展示",
  })
  expect(firstBody.data.hasMore).toBe(true)
  expect(firstBody.data.nextBefore).toBe(4)

  const secondResponse = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/messages?before=4&limit=3`, server.url),
  )
  const secondBody = (await secondResponse.json()) as {
    data: { messages: Array<{ index: number; message: Record<string, unknown> }>; nextBefore?: number }
  }

  expect(secondResponse.status).toBe(200)
  expect(secondBody.data.messages.map((item) => item.index)).toEqual([1, 2, 3])
  expect(secondBody.data.messages[1]?.message).toMatchObject({
    role: "assistant",
    toolCalls: [
      {
        id: "tool-call-001",
        input: {
          token: "[REDACTED]",
          nested: [{ access_token: "[REDACTED]", client_secret: "[REDACTED]" }],
        },
      },
    ],
  })
  expect(secondBody.data.messages[2]?.message).toMatchObject({
    role: "tool",
    content: 'tool output: {"access_token":[REDACTED],"private_key":[REDACTED]}',
  })
  expect(JSON.stringify(secondBody.data.messages)).not.toContain("内部角色提示词")
  expect(secondBody.data.nextBefore).toBe(1)

  const expiredResponse = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/messages?before=4&snapshot=stale`, server.url),
  )
  expect(expiredResponse.status).toBe(409)
  expect(((await expiredResponse.json()) as { errorCode: string }).errorCode).toBe("NEXUM_HISTORY_SNAPSHOT_EXPIRED")

  const invalidResponse = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/messages?limit=0`, server.url),
  )
  expect(invalidResponse.status).toBe(400)
  expect(((await invalidResponse.json()) as { errorCode: string }).errorCode).toBe("NEXUM_INVALID_REQUEST")

  const missingResponse = await fetch(
    new URL("/api/experimental/nexum/session/missing-session/messages", server.url),
  )
  expect(missingResponse.status).toBe(404)
  expect(((await missingResponse.json()) as { errorCode: string }).errorCode).toBe("NEXUM_SESSION_NOT_FOUND")
})

test("rejects deletion for a running session with a stable conflict", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-delete-running-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  await sessionService.setStatus(session.sessionID, "running")
  const server = await startNexumServer({ port: 0, sessionService })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })
  const body = (await response.json()) as { errorCode: string; message: string }

  expect(response.status).toBe(409)
  expect(body).toMatchObject({
    errorCode: "NEXUM_SESSION_RUN_CONFLICT",
    message: "Session 当前正在运行，请先等待本轮完成后再删除",
  })
})

test("maps session deletion storage failures without exposing internals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-delete-failure-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const messageStore: MessageStore = {
    async load() {
      return []
    },
    async save() {},
    async delete() {
      throw new Error("internal message store details")
    },
  }
  const server = await startNexumServer({ port: 0, sessionService, messageStore })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })
  const body = (await response.json()) as { errorCode: string; message: string }

  expect(response.status).toBe(500)
  expect(body).toEqual(expect.objectContaining({ errorCode: "NEXUM_SESSION_DELETE_FAILED", message: "Session 删除失败" }))
  expect(JSON.stringify(body)).not.toContain("internal message store details")
  expect(await sessionService.get(session.sessionID)).toEqual(session)
})

test("restores sessions from a file store after the server restarts", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-server-persistent-"))
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-persistent-project-"))
  temporaryDirectories.push(root, directory)
  const filePath = join(root, "sessions.json")
  const firstServer = await startNexumServer({ port: 0, sessionStore: createFileSessionStore({ filePath }) })
  const createResponse = await fetch(new URL("/api/nexum/session", firstServer.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "持久化项目", directory }),
  })
  expect(createResponse.status).toBe(200)
  await firstServer.stop(true)

  const secondServer = await startNexumServer({ port: 0, sessionStore: createFileSessionStore({ filePath }) })
  servers.push(secondServer)
  const listResponse = await fetch(new URL("/api/nexum/session", secondServer.url))
  const body = (await listResponse.json()) as { data: Array<{ name: string; directory: string }> }

  expect(body.data).toEqual([expect.objectContaining({ name: "持久化项目", directory })])
})

test("returns a stable JSON error when the session store fails during a request", async () => {
  const sessionStore: SessionStore = {
    async get() {
      return undefined
    },
    async list() {
      throw new Error("internal session store details")
    },
    async save() {},
    async delete() {},
  }
  const server = await startNexumServer({
    port: 0,
    sessionService: createNexumSessionService({ store: sessionStore }),
  })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/session", server.url))
  const body = (await response.json()) as {
    errorCode: string
    message: string
    traceId: string
    meta: { protocolVersion: string; traceId: string }
  }

  expect(response.status).toBe(500)
  expect(body).toMatchObject({ errorCode: "NEXUM_INTERNAL_ERROR", message: "Nexum Service 暂时不可用" })
  expect(JSON.stringify(body)).not.toContain("internal session store details")
})

test("refuses to start with a corrupt persistent session file", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-server-corrupt-"))
  temporaryDirectories.push(root)
  const filePath = join(root, "sessions.json")
  await Bun.write(filePath, "not-json")

  await expect(startNexumServer({ port: 0, sessionStore: createFileSessionStore({ filePath }) })).rejects.toThrow()
})

test("probes the configured model without returning model content or credentials", async () => {
  const server = await startNexumServer({
    port: 0,
    modelProbe: {
      async probe(input) {
        if (!input) throw new Error("缺少 Probe 输入")
        expect(input.mode).toBe("both")
        expect(input.signal).toBeInstanceOf(AbortSignal)
        expect(input.timeoutMs).toBe(30_000)
        return { text: "pass", functionCalling: "pass" }
      },
    },
  })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/model/probe", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "both" }),
  })
  const body = (await response.json()) as { data: { text: string; functionCalling: string } }

  expect(response.status).toBe(200)
  expect(body).toMatchObject({
    data: { text: "pass", functionCalling: "pass" },
    meta: { protocolVersion: "nexum.runtime.v1" },
  })
  expect(JSON.stringify(body)).not.toContain("credential")
})

test("rejects an invalid model probe mode with a stable error", async () => {
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/model/probe", server.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-trace-id": "probe_invalid_trace" },
    body: JSON.stringify({ mode: "secret" }),
  })
  const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

  expect(response.status).toBe(400)
  expect(body.errorCode).toBe("NEXUM_INVALID_MODEL_PROBE")
  expect(body.traceId).toBe("probe_invalid_trace")
})

test("rejects an invalid session directory at the HTTP boundary", async () => {
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-trace-id": "session_create_trace" },
    body: JSON.stringify({ directory: join(tmpdir(), `missing-nexum-server-directory-${crypto.randomUUID()}`) }),
  })
  const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

  expect(response.status).toBe(400)
  expect(body.errorCode).toBe("NEXUM_INVALID_DIRECTORY")
  expect(body.traceId).toBe("session_create_trace")
  expect(body.message).toBeString()
})

test("accepts a prompt and delegates it to the injected coding loop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-prompt-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const prompts: Array<{ sessionID: string; text: string }> = []
  const server = await startNexumServer({
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

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "请读取 README.md" }),
  })
  const body = (await response.json()) as { data: { status: string } }

  expect(response.status).toBe(200)
  expect(body.data).toEqual({ status: "accepted" })
  expect(prompts).toEqual([{ sessionID: session.sessionID, text: "请读取 README.md" }])

  const cancelResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/cancel`, server.url),
    {
      method: "POST",
    },
  )
  expect(cancelResponse.status).toBe(200)
  expect(await cancelResponse.json()).toMatchObject({
    data: { status: "cancelled" },
    meta: { protocolVersion: "nexum.runtime.v1" },
  })
})

test("rejects cancellation after the session reaches a terminal status", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-terminal-cancel-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  await sessionService.setStatus(session.sessionID, "running")
  await sessionService.setStatus(session.sessionID, "completed")
  let cancelled = false
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async cancel(sessionID) {
        cancelled = true
        return (await sessionService.get(sessionID))!
      },
    },
  })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/cancel`, server.url), { method: "POST" })
  const body = (await response.json()) as { errorCode: string; message: string }

  expect(response.status).toBe(409)
  expect(body.errorCode).toBe("NEXUM_SESSION_CANCEL_CONFLICT")
  expect(body.message).toBe("Session 当前状态不允许取消")
  expect(cancelled).toBe(false)
})

test("rejects an oversized JSON prompt before starting the coding loop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-body-limit-"))
  temporaryDirectories.push(directory)
  let started = false
  const server = await startNexumServer({
    port: 0,
    codingLoop: {
      async run(input) {
        started = true
        return {
          sessionID: input.sessionID,
          name: "body-limit",
          directory,
          status: "completed" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      },
      async cancel() {
        throw new Error("cancel is not used in this test")
      },
    },
  })
  servers.push(server)
  const session = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const sessionBody = (await session.json()) as { data: { id: string } }

  const response = await fetch(new URL(`/api/nexum/session/${sessionBody.data.id}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(1_048_576) }),
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ errorCode: "NEXUM_INVALID_REQUEST" })
  expect(started).toBe(false)
})

test("reserves running before a legacy prompt adapter can race with deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-prompt-legacy-race-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  let releaseRun = () => {}
  const runReleased = new Promise<void>((resolve) => {
    releaseRun = resolve
  })
  let finishRun = () => {}
  const runFinished = new Promise<void>((resolve) => {
    finishRun = resolve
  })
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        await runReleased
        const completed = await sessionService.setStatus(input.sessionID, "completed")
        finishRun()
        return completed
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const promptResponse = await fetch(new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "legacy" }),
  })
  const deleteWhileRunning = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })
  releaseRun()
  await runFinished
  const deleteAfterRun = await fetch(new URL(`/api/nexum/session/${session.sessionID}`, server.url), { method: "DELETE" })

  expect(promptResponse.status).toBe(200)
  expect(deleteWhileRunning.status).toBe(409)
  expect(deleteAfterRun.status).toBe(200)
})

test("rejects prompt admission failures before returning accepted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-prompt-admission-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  let admissionError: unknown = new NexumSessionError("session_not_found", "内部 Session 错误", session.sessionID)
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      start() {
        const admission = Promise.reject<SessionRecord>(admissionError)
        return { accepted: true, admission, promise: admission.then(() => sessionService.get(session.sessionID).then((value) => value!)) }
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const cases = [
    { error: new NexumSessionError("session_not_found", "内部 Session 错误", session.sessionID), status: 404, errorCode: "NEXUM_SESSION_NOT_FOUND" },
    { error: new NexumSessionError("session_busy", "内部 Session 错误", session.sessionID), status: 409, errorCode: "NEXUM_SESSION_RUN_CONFLICT" },
    { error: new Error("internal admission details"), status: 500, errorCode: "NEXUM_INTERNAL_ERROR" },
  ] as const

  for (const current of cases) {
    admissionError = current.error
    const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-trace-id": "prompt_admission_trace" },
      body: JSON.stringify({ text: "提交任务" }),
    })
    const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

    expect(response.status).toBe(current.status)
    expect(body).toMatchObject({ errorCode: current.errorCode, traceId: "prompt_admission_trace" })
    expect(body.message).not.toContain("内部 Session 错误")
    expect(body.message).not.toContain("internal admission details")
  }
})

test("rejects a prompt while the session is already running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-prompt-conflict-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  await sessionService.setStatus(session.sessionID, "running")
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-trace-id": "prompt_conflict_trace" },
    body: JSON.stringify({ text: "第二次提交" }),
  })
  const body = (await response.json()) as {
    errorCode: string
    message: string
    traceId: string
    meta: { protocolVersion: string; traceId: string }
  }

  expect(response.status).toBe(409)
  expect(body).toEqual({
    errorCode: "NEXUM_SESSION_RUN_CONFLICT",
    message: "Session 当前正在运行，请等待本轮完成后再提交",
    traceId: "prompt_conflict_trace",
    meta: { protocolVersion: "nexum.runtime.v1", traceId: "prompt_conflict_trace" },
  })
})

test("accepts an experimental continue request without appending a new prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-continue-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const continuations: string[] = []
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async continueStart(sessionID) {
        continuations.push(sessionID)
        const admission = sessionService.setStatus(sessionID, "running")
        return { accepted: true, admission, promise: admission.then(() => sessionService.get(sessionID).then((value) => value!)) }
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/continue`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  )

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    data: { status: "accepted" },
    meta: { protocolVersion: "nexum.runtime.v1" },
  })
  expect(continuations).toEqual([session.sessionID])
})

test("rejects experimental continue admission failures before returning accepted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-continue-admission-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  let admissionError: unknown = new NexumSessionError("session_not_found", "内部 Session 错误", session.sessionID)
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async continueStart() {
        const admission = Promise.reject<SessionRecord>(admissionError)
        return { accepted: true, admission, promise: admission }
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const cases = [
    { error: admissionError, status: 404, errorCode: "NEXUM_SESSION_NOT_FOUND" },
    { error: new NexumSessionError("session_busy", "内部运行冲突", session.sessionID), status: 409, errorCode: "NEXUM_SESSION_RUN_CONFLICT" },
    { error: new Error("internal continue admission details"), status: 503, errorCode: "NEXUM_CONTINUE_FAILED" },
  ] as const

  for (const current of cases) {
    admissionError = current.error
    const response = await fetch(
      new URL(`/api/experimental/nexum/session/${session.sessionID}/continue`, server.url),
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-trace-id": "continue_admission_trace" },
        body: "{}",
      },
    )
    const body = (await response.json()) as { errorCode: string; message: string; traceId: string }

    expect(response.status).toBe(current.status)
    expect(body).toMatchObject({ errorCode: current.errorCode, traceId: "continue_admission_trace" })
    expect(body.message).not.toContain("internal continue admission details")
  }
})

test("rejects experimental continue while the session is running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-continue-conflict-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  await sessionService.setStatus(session.sessionID, "running")
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      continueStart() {
        throw new Error("continue should not be called for a running session")
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/continue`, server.url),
    { method: "POST", body: "{}" },
  )
  const body = (await response.json()) as {
    errorCode: string
    message: string
    traceId: string
    meta: { protocolVersion: string; traceId: string }
  }

  expect(response.status).toBe(409)
  expect(body).toEqual({
    errorCode: "NEXUM_SESSION_RUN_CONFLICT",
    message: "Session 当前正在运行，请等待本轮完成后再继续",
    traceId: expect.any(String),
    meta: expect.objectContaining({ protocolVersion: "nexum.runtime.v1" }),
  })
})

test("rejects a legacy continue adapter without atomic admission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-continue-legacy-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async continue() {
        throw new Error("legacy continue should not be called")
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/continue`, server.url),
    { method: "POST", body: "{}" },
  )
  const body = (await response.json()) as { errorCode: string; message: string }

  expect(response.status).toBe(503)
  expect(body).toMatchObject({
    errorCode: "NEXUM_CONTINUE_NOT_CONFIGURED",
    message: "Nexum Continue 尚未配置",
  })
})

test("returns a stable error when no continuation context is available", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-continue-context-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const server = await startNexumServer({
    port: 0,
    sessionService,
    codingLoop: {
      async run(input) {
        return (await sessionService.get(input.sessionID))!
      },
      async continueStart() {
        return { accepted: false, reason: "not_continuable" as const }
      },
      async cancel(sessionID) {
        return sessionService.setStatus(sessionID, "cancelled")
      },
    },
  })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/experimental/nexum/session/${session.sessionID}/continue`, server.url),
    { method: "POST", body: "{}" },
  )
  const body = (await response.json()) as { errorCode: string; message: string }

  expect(response.status).toBe(409)
  expect(body).toMatchObject({
    errorCode: "NEXUM_SESSION_NOT_CONTINUABLE",
    message: "Session 没有可继续的上下文",
  })
})

test("rejects concurrent prompts before the first run persists running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-prompt-race-"))
  temporaryDirectories.push(directory)
  const baseSessionService = createNexumSessionService()
  const session = await baseSessionService.create({ directory })
  let getCount = 0
  let releaseGets = () => {}
  const getsReady = new Promise<void>((resolve) => {
    releaseGets = resolve
  })
  const sessionService = {
    ...baseSessionService,
    async get(sessionID: string) {
      const current = await baseSessionService.get(sessionID)
      getCount += 1
      if (getCount === 2) releaseGets()
      await getsReady
      return current
    },
  }
  const model: ModelPort = {
    async *prompt() {
      await new Promise((resolve) => setTimeout(resolve, 50))
      yield { type: "text", content: "完成" }
      yield { type: "completed" }
    },
  }
  const tool: ToolPort = {
    async execute() {
      return { ok: true, output: "" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const codingLoop = createNexumCodingLoop({
    model,
    tool,
    permission,
    sessions: baseSessionService,
    events: { async publish() {} },
  })
  const server = await startNexumServer({ port: 0, sessionService, codingLoop })
  servers.push(server)

  const prompt = (text: string) =>
    fetch(new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
  const responses = await Promise.all([prompt("第一条"), prompt("第二条")])
  const statuses = responses.map((response) => response.status).sort((left, right) => left - right)

  expect(statuses).toEqual([200, 409])
  await new Promise((resolve) => setTimeout(resolve, 100))
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
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const modelResponse = await fetch(new URL("/api/nexum/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseUrl: upstream.url.toString().replace(/\/$/, ""),
      model: "poc-model",
      credential: "test-credential",
    }),
  })
  expect(modelResponse.status).toBe(200)

  const directory = await mkdtemp(join(tmpdir(), "nexum-server-default-runtime-"))
  temporaryDirectories.push(directory)
  const sessionResponse = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const sessionBody = (await sessionResponse.json()) as { data: { id: string } }
  const eventsResponse = await fetch(
    new URL(`/api/nexum/session/${sessionBody.data.id}/events`, server.url),
  )
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()

  const promptResponse = await fetch(
    new URL(`/api/nexum/session/${sessionBody.data.id}/prompt`, server.url),
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

  const secondPromptResponse = await fetch(
    new URL(`/api/nexum/session/${sessionBody.data.id}/prompt`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "请再运行一次" }),
    },
  )
  expect(secondPromptResponse.status).toBe(200)
  await readSseUntil(reader, '"type":"session.completed"')
  expect(modelRequests).toHaveLength(2)
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
  const server = await startNexumServer({ port: 0 })
  servers.push(server)

  const modelResponse = await fetch(new URL("/api/nexum/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseUrl: upstream.url.toString().replace(/\/$/, ""),
      model: "fixture-model",
      credential: "test-credential",
    }),
  })
  expect(modelResponse.status).toBe(200)

  const directory = await mkdtemp(join(tmpdir(), "nexum-server-function-calling-"))
  temporaryDirectories.push(directory)
  const sessionResponse = await fetch(new URL("/api/nexum/session", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  const sessionBody = (await sessionResponse.json()) as { data: { id: string } }
  const sessionID = sessionBody.data.id
  const eventsResponse = await fetch(new URL(`/api/nexum/session/${sessionID}/events`, server.url))
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()

  const promptResponse = await fetch(new URL(`/api/nexum/session/${sessionID}/prompt`, server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "请写入 notes.txt" }),
  })
  expect(promptResponse.status).toBe(200)

  const toolEventText = await readSseUntil(reader, '"type":"tool.request"')
  expect(toolEventText).toContain('"toolCallID":"call_write_001"')

  const permissionListResponse = await fetch(
    new URL(`/api/nexum/session/${sessionID}/permission`, server.url),
  )
  const permissionBody = (await permissionListResponse.json()) as {
    data: Array<{ id: string; action: string; resource: string }>
  }
  expect(permissionBody.data).toHaveLength(1)
  expect(permissionBody.data[0]).toMatchObject({ action: "write", resource: "notes.txt" })

  const replyResponse = await fetch(
    new URL(
      `/api/nexum/session/${sessionID}/permission/${permissionBody.data[0]!.id}/reply`,
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
    { role: "system", content: NEXUM_DEFAULT_ROLE_PROMPT },
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
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-events-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createNexumEventHub()
  const server = await startNexumServer({ port: 0, sessionService, eventHub })
  servers.push(server)

  const response = await fetch(new URL(`/api/nexum/session/${session.sessionID}/events`, server.url), {
    headers: { "x-trace-id": "events_trace_001" },
  })
  const reader = response.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  expect(response.headers.get("x-trace-id")).toBe("events_trace_001")

  const connectedChunk = await reader.read()
  expect(new TextDecoder().decode(connectedChunk.value)).toContain("nexum-events-connected")

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

  const retryRead = reader.read()
  await eventHub.publish({
    type: "model.retry",
    sessionID: session.sessionID,
    runID: "run-retry",
    sequence: 2,
    data: { attempt: 1, maxRetries: 2, delayMs: 250, willRetry: true },
  })
  const retryText = new TextDecoder().decode(
    (await Promise.race([
      retryRead,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE 重试事件读取超时")), 1_000)),
    ])).value,
  )
  expect(retryText).toContain("event: model.retry")
  expect(retryText).toContain('"willRetry":true')

  const settledRead = reader.read()
  await eventHub.publish({
    type: "run.settled",
    sessionID: session.sessionID,
    runID: "run-retry",
    sequence: 3,
    data: { result: "failed" },
  })
  const settledText = new TextDecoder().decode(
    (await Promise.race([
      settledRead,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE 结算事件读取超时")), 1_000)),
    ])).value,
  )
  expect(settledText).toContain("event: run.settled")
  expect(settledText).toContain('"result":"failed"')
  await reader.cancel()
  await eventHub.publish({
    type: "session.completed",
    sessionID: session.sessionID,
    sequence: 2,
  })
  await Bun.sleep(10)
})

test("starts an SSE replay after a sequence cursor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-events-sequence-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createNexumEventHub()
  await eventHub.publish({ type: "assistant.text", sessionID: session.sessionID, sequence: 1, data: { content: "旧消息" } })
  await eventHub.publish({ type: "tool.result", sessionID: session.sessionID, sequence: 2, data: { ok: true } })
  await eventHub.publish({ type: "session.completed", sessionID: session.sessionID, sequence: 3 })
  const server = await startNexumServer({ port: 0, sessionService, eventHub })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/events?afterSequence=2`, server.url),
  )
  const reader = response.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  const text = await readSseUntil(reader, '"sequence":3')

  expect(response.status).toBe(200)
  expect(text).toContain("event: session.completed")
  expect(text).toContain('"sequence":3')
  expect(text).not.toContain("旧消息")
  await reader.cancel()
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

test("replays persisted events from a fresh server and resumes after Last-Event-ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-server-event-restart-"))
  temporaryDirectories.push(root)
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-event-restart-project-"))
  temporaryDirectories.push(directory)
  const eventFile = join(root, "events.json")
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })

  const firstHub = createNexumEventHub({ filePath: eventFile })
  await firstHub.ready?.()
  const firstServer = await startNexumServer({ port: 0, sessionService, eventHub: firstHub })
  await firstHub.publish({
    type: "session.started",
    sessionID: session.sessionID,
    sequence: 1,
    eventID: "restart-e1",
    data: { status: "running" },
  })
  await firstHub.publish({
    type: "assistant.text",
    sessionID: session.sessionID,
    sequence: 2,
    eventID: "restart-e2",
    data: { text: "重启后仍可回放" },
  })
  await firstServer.stop(true)

  const secondHub = createNexumEventHub({ filePath: eventFile })
  await secondHub.ready?.()
  const secondServer = await startNexumServer({ port: 0, sessionService, eventHub: secondHub })
  servers.push(secondServer)
  const eventsUrl = new URL(`/api/nexum/session/${session.sessionID}/events`, secondServer.url)

  const fullResponse = await fetch(eventsUrl)
  const fullReader = fullResponse.body?.getReader()
  if (!fullReader) throw new Error("SSE 响应缺少可读流")
  const fullText = await readSseUntil(fullReader, '"sequence":2')
  expect(fullText).toContain('"eventID":"restart-e1"')
  expect(fullText).toContain("重启后仍可回放")
  await fullReader.cancel()

  const resumedResponse = await fetch(eventsUrl, { headers: { "last-event-id": "restart-e1" } })
  const resumedReader = resumedResponse.body?.getReader()
  if (!resumedReader) throw new Error("SSE 响应缺少可读流")
  const resumedText = await readSseUntil(resumedReader, '"sequence":2')
  expect(resumedText).toContain('"eventID":"restart-e2"')
  expect(resumedText).not.toContain('"eventID":"restart-e1"')
  await resumedReader.cancel()
})

test("serves Question replies and streams tool plus context compaction completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-question-chain-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const eventHub = createNexumEventHub()
  const questionPort = createNexumQuestionPort()
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
  const codingLoop = createNexumCodingLoop({
    model,
    tool,
    permission,
    sessions: sessionService,
    events,
    question: questionPort,
    contextCompaction: compaction,
    compactionThreshold: 10,
  })
  const server = await startNexumServer({
    port: 0,
    sessionService,
    eventHub,
    codingLoop,
    questionPort,
  })
  servers.push(server)

  const eventsResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/events`, server.url),
  )
  const reader = eventsResponse.body?.getReader()
  if (!reader) throw new Error("SSE 响应缺少可读流")
  await reader.read()
  const promptResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/prompt`, server.url),
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
    new URL(`/api/nexum/session/${session.sessionID}/question`, server.url),
  )
  const pending = (await listResponse.json()) as { data: Array<{ id: string; questions: unknown[] }> }
  expect(pending.data).toHaveLength(1)
  expect(pending.data[0]).toMatchObject({ id: "question_chain_001" })

  const replyResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/question/question_chain_001/reply`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [["src"]] }),
    },
  )
  expect(replyResponse.status).toBe(200)
  expect(await replyResponse.json()).toMatchObject({
    data: { status: "answered" },
    meta: { protocolVersion: "nexum.runtime.v1" },
  })

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
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-question-cancel-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const questionPort = createNexumQuestionPort()
  const pending = questionPort.ask({
    id: "question_cancel_001",
    sessionID: session.sessionID,
    toolCallID: "call_question_cancel_001",
    questions: [{ header: "确认", question: "继续吗", options: [{ label: "是", description: "继续" }] }],
  })
  const server = await startNexumServer({ port: 0, sessionService, questionPort })
  servers.push(server)

  const response = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/question/question_cancel_001/cancel`, server.url),
    { method: "POST" },
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    data: { status: "cancelled" },
    meta: { protocolVersion: "nexum.runtime.v1" },
  })
  await expect(pending).resolves.toEqual({ ok: false, output: "问题已取消" })
})

test("lists pending permissions and returns stable approval errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-permission-"))
  temporaryDirectories.push(directory)
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const permissionBroker = createNexumPermissionBroker()
  const server = await startNexumServer({ port: 0, sessionService, permissionBroker })
  servers.push(server)

  const listResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/permission`, server.url),
  )
  expect(listResponse.status).toBe(200)
  expect(await listResponse.json()).toMatchObject({ data: [], meta: { protocolVersion: "nexum.runtime.v1" } })

  const replyResponse = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/permission/unknown/reply`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "allow_once" }),
    },
  )
  const replyBody = (await replyResponse.json()) as { errorCode: string; message: string }
  expect(replyResponse.status).toBe(404)
  expect(replyBody.errorCode).toBe("NEXUM_PERMISSION_NOT_FOUND")
  expect(replyBody.message).toBe("权限请求不存在")
})

test("stores model configuration without returning its credential", async () => {
  const modelConfigStore = createNexumModelConfigStore()
  const server = await startNexumServer({ port: 0, modelConfigStore })
  servers.push(server)

  const updateResponse = await fetch(new URL("/api/nexum/model", server.url), {
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

  const invalidResponse = await fetch(new URL("/api/nexum/model", server.url), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl: "invalid", model: "next-model" }),
  })
  expect(invalidResponse.status).toBe(400)

  const getResponse = await fetch(new URL("/api/nexum/model", server.url))
  expect(getResponse.status).toBe(200)
  expect(await getResponse.json()).toMatchObject({ data: updateBody.data, meta: { protocolVersion: "nexum.runtime.v1" } })
})

test("returns an explicit null data value when no model configuration exists", async () => {
  const server = await startNexumServer({ port: 0, modelConfigStore: createNexumModelConfigStore() })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/model", server.url))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ data: null, meta: { protocolVersion: "nexum.runtime.v1" } })
})

test("nexum-server package stays independent from UI packages", async () => {
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_SURFACE_PACKAGES))
})

test("recovers persisted interaction requests as orphaned and rejects their old reply IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-server-interaction-recovery-"))
  const directory = await mkdtemp(join(tmpdir(), "nexum-server-interaction-project-"))
  temporaryDirectories.push(root, directory)
  const interactionStore = createFileInteractionStore({ filePath: join(root, "interactions.json") })
  await interactionStore.save({
    requestID: "orphaned-permission-001",
    sessionID: "session-recovery",
    status: "pending",
    createdAt: "2026-11-22T00:00:00.000Z",
    updatedAt: "2026-11-22T00:00:00.000Z",
    kind: "permission",
    action: "shell",
    resource: "pwd",
  })
  const sessionService = createNexumSessionService()
  const session = await sessionService.create({ directory })
  const restartedInteractionStore = createFileInteractionStore({ filePath: join(root, "interactions.json") })
  const server = await startNexumServer({ port: 0, sessionService, interactionStore: restartedInteractionStore })
  servers.push(server)

  const state = await fetch(new URL(`/api/nexum/session/${session.sessionID}/state`, server.url))
  expect((await state.json()) as { data: { pendingPermissions: unknown[] } }).toMatchObject({
    data: { pendingPermissions: [] },
  })

  const reply = await fetch(
    new URL(`/api/nexum/session/${session.sessionID}/permission/orphaned-permission-001/reply`, server.url),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "allow_once" }),
    },
  )
  expect(reply.status).toBe(404)
  expect(await restartedInteractionStore.get("orphaned-permission-001")).toMatchObject({ status: "orphaned" })
})
