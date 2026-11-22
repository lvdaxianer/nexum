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
