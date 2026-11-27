import { expect, test } from "bun:test"
import { Nexum, NexumClientError } from "../src/index.ts"

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

test("queries the provider catalog through the model client namespace", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { providers: [], generatedAt: "2026-11-26T00:00:00.000Z" },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_provider" },
      })
    },
  })

  expect((await client.experimental.nexum.model.catalog()).data.providers).toEqual([])
  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/providers")
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

test("creates a Session with an explicit Agent mode", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: {
          id: "session_001",
          name: "计划会话",
          directory: "/workspace/demo",
          status: "idle",
          mode: "plan",
          createdAt: "2026-11-27T00:00:00.000Z",
          updatedAt: "2026-11-27T00:00:00.000Z",
        },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_create_mode" },
      })
    },
  })

  const result = await client.experimental.nexum.session.create({ directory: "/workspace/demo", mode: "plan" })

  expect(result.data.mode).toBe("plan")
  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/session")
  expect(await requests[0]?.json()).toEqual({ directory: "/workspace/demo", mode: "plan" })
})

test("switches a session Agent mode through the stable mode endpoint", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { id: "session_001", mode: "plan", status: "idle" },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_mode" },
      })
    },
  })

  const result = await client.experimental.nexum.session.setMode({ sessionID: "session/001", mode: "plan" })

  expect(result.data).toMatchObject({ id: "session_001", mode: "plan" })
  expect(requests[0]?.url).toBe("http://nexum.test/api/nexum/session/session%2F001/mode")
  expect(requests[0]?.method).toBe("PUT")
  expect(await requests[0]?.json()).toEqual({ mode: "plan" })
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

test("manages the default role prompt through the Nexum client", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { prompt: "使用中文回答。", source: "custom" },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_role" },
      })
    },
  })

  await client.experimental.nexum.rolePrompt.get()
  await client.experimental.nexum.rolePrompt.update({ prompt: "使用中文回答。" })
  await client.experimental.nexum.rolePrompt.reset()

  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://nexum.test/api/nexum/role-prompt"],
    ["PUT", "http://nexum.test/api/nexum/role-prompt"],
    ["DELETE", "http://nexum.test/api/nexum/role-prompt"],
  ])
  expect(await requests[1]?.json()).toEqual({ prompt: "使用中文回答。" })
})

test("manages permission policy rules through the stable policy endpoints", async () => {
  const requests: Request[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      return Response.json({
        data: { id: "policy_001", deleted: true },
        meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_policy" },
      })
    },
  })

  await client.experimental.nexum.permissionPolicy.list()
  await client.experimental.nexum.permissionPolicy.list({ sessionID: "session/001" })
  await client.experimental.nexum.permissionPolicy.create({ action: "shell", resource: "git *", effect: "allow" })
  await client.experimental.nexum.permissionPolicy.update({ ruleID: "policy/001", effect: "deny" })
  await client.experimental.nexum.permissionPolicy.remove({ ruleID: "policy/001" })

  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://nexum.test/api/nexum/permission/policy"],
    ["GET", "http://nexum.test/api/nexum/permission/policy?sessionID=session%2F001"],
    ["POST", "http://nexum.test/api/nexum/permission/policy"],
    ["PUT", "http://nexum.test/api/nexum/permission/policy/policy%2F001"],
    ["DELETE", "http://nexum.test/api/nexum/permission/policy/policy%2F001"],
  ])
  expect(await requests[2]?.json()).toEqual({ action: "shell", resource: "git *", effect: "allow" })
  expect(await requests[3]?.json()).toEqual({ effect: "deny" })
  expect(await requests[4]?.text()).toBe("")
})

test("surfaces permission policy conflicts as NexumClientError with the stable code", async () => {
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async () =>
      Response.json(
        {
          errorCode: "NEXUM_PERMISSION_POLICY_CONFLICT",
          message: "相同作用域下已存在同规则",
          traceId: "trace_conflict",
          meta: { protocolVersion: "nexum.runtime.v1", traceId: "trace_conflict" },
        },
        { status: 409 },
      ),
  })

  const failure = await client.experimental.nexum.permissionPolicy
    .create({ action: "shell", resource: "git *", effect: "allow" })
    .catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(NexumClientError)
  expect((failure as NexumClientError).status).toBe(409)
  expect((failure as NexumClientError).code).toBe("NEXUM_PERMISSION_POLICY_CONFLICT")
  expect((failure as NexumClientError).traceId).toBe("trace_conflict")
})
