import { expect, test } from "bun:test"
import { Nexum } from "../src/index.ts"

test("uses the Nexum runtime protocol for capability requests", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: {
          protocolVersion: "nexum.runtime.v1",
          transport: { http: "json", events: "sse" },
          features: ["session"],
          eventTypes: ["session.created"],
          capabilities: [],
        },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_001" },
      })
    },
  })

  const result = await client.capabilities()

  expect(result.data.protocolVersion).toBe("nexum.runtime.v1")
  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/capabilities")
  expect(requests[0]?.method).toBe("GET")
})

test("uses the experimental continue endpoint without appending a duplicate prompt", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { status: "accepted" },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_continue" },
      })
    },
  })

  const result = await client.experimental.nexum.session.continue({ sessionID: "session_001" })

  expect(result.data.status).toBe("accepted")
  expect(requests[0]?.url).toBe("http://nexum.test/api/experimental/nexum/session/session_001/continue")
  expect(requests[0]?.method).toBe("POST")
  expect(await requests[0]?.text()).toBe("{}")
})

test("deletes a session through the stable DELETE endpoint", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { id: "session_001", deleted: true },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_delete" },
      })
    },
  })

  const result = await client.experimental.nexum.session.delete({ sessionID: "session/001" })

  expect(result.data).toEqual({ id: "session_001", deleted: true })
  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/session/session%2F001")
  expect(requests[0]?.method).toBe("DELETE")
  expect(await requests[0]?.text()).toBe("")
})

test("manages Skill registrations by address through the Nexum client", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { id: "metric-view-lifecycle", deleted: true },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_skill" },
      })
    },
  })

  await client.experimental.nexum.skill.register({ address: "/workspace/skills/metric-view-lifecycle" })
  await client.experimental.nexum.skill.refresh({ id: "metric-view-lifecycle" })
  await client.experimental.nexum.skill.unregister({ id: "metric-view-lifecycle" })

  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["POST", "http://nexum.test/api/nexum/skills/register"],
    ["POST", "http://nexum.test/api/nexum/skills/refresh"],
    ["DELETE", "http://nexum.test/api/nexum/skills/metric-view-lifecycle"],
  ])
  expect(await requests[0]?.json()).toEqual({ address: "/workspace/skills/metric-view-lifecycle" })
  expect(await requests[1]?.json()).toEqual({ id: "metric-view-lifecycle" })
  expect(await requests[2]?.text()).toBe("")
})
