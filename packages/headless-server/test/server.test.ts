import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHeadlessPermissionBroker, createHeadlessSessionService } from "@opencode/headless-core"
import { startHeadlessServer, type HeadlessServer } from "../src/index.ts"

const FORBIDDEN_UI_PACKAGES = ["@opencode/app", "@opencode/tui", "@opencode/desktop", "@opencode/cli"]
const servers: HeadlessServer[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
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

test("headless-server package stays independent from UI packages", async () => {
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})
