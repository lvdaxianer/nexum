import { expect, test } from "bun:test"
import { Nexum } from "../src/index.ts"

test("exposes MCP lifecycle and catalog controls under the experimental client namespace", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: request.method === "GET" ? [{ id: "remote", name: "Remote", status: "connected" }] : { id: "remote", name: "Remote", status: "pending" },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_mcp" },
      })
    },
  })

  await client.experimental.nexum.mcp.list()
  await client.experimental.nexum.mcp.add({ id: "remote", name: "Remote", url: "https://mcp.example.test" })
  await client.experimental.nexum.mcp.connect({ id: "remote" })
  await client.experimental.nexum.mcp.tools({ id: "remote" })
  await client.experimental.nexum.mcp.disconnect({ id: "remote" })
  await client.experimental.nexum.mcp.remove({ id: "remote" })
  await client.experimental.nexum.mcp.authorize({ id: "remote" })
  await client.experimental.nexum.mcp.authorizationStatus({ attemptID: "attempt-1" })
  await client.experimental.nexum.mcp.completeAuthorization({ attemptID: "attempt-1", redirectUrl: "http://127.0.0.1/callback?code=one" })
  await client.experimental.nexum.mcp.cancelAuthorization({ attemptID: "attempt-1" })

  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://nexum.test/api/experimental/nexum/mcp"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp/remote/connect"],
    ["GET", "http://nexum.test/api/experimental/nexum/mcp/remote/tools"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp/remote/disconnect"],
    ["DELETE", "http://nexum.test/api/experimental/nexum/mcp/remote"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp/remote/oauth/authorize"],
    ["GET", "http://nexum.test/api/experimental/nexum/mcp/oauth/attempt-1"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp/oauth/attempt-1/complete"],
    ["POST", "http://nexum.test/api/experimental/nexum/mcp/oauth/attempt-1/cancel"],
  ])
  expect(await requests[1]?.json()).toEqual({ id: "remote", name: "Remote", url: "https://mcp.example.test" })
  expect(await requests[8]?.json()).toEqual({ redirectUrl: "http://127.0.0.1/callback?code=one" })
})
