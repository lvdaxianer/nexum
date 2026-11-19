import { afterEach, expect, test } from "bun:test"
import { startHeadlessServer, type HeadlessServer } from "../src/index.ts"

const FORBIDDEN_UI_PACKAGES = ["@opencode/app", "@opencode/tui", "@opencode/desktop", "@opencode/cli"]
const servers: HeadlessServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
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

test("headless-server package stays independent from UI packages", async () => {
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})
