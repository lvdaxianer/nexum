import { expect, test } from "bun:test"
import { ChatProtocolError, createChatProtocolAdapter } from "../src/index.ts"

const traceId = "trace_chat_surface"

test("default adapter maps Nexum HTTP and SSE operations to the ChatSurface contract", async () => {
  const requests: Request[] = []
  const event = {
    eventID: "event_001",
    runID: "run_001",
    type: "assistant.text",
    sessionID: "session_001",
    sequence: 8,
    occurredAt: "2026-11-24T00:00:00.000Z",
    data: { content: "你好" },
  } as const
  const adapter = createChatProtocolAdapter({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      requests.push(request)
      if (request.url.includes("/events")) {
        return new Response(`data: ${JSON.stringify(event)}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
      }
      return Response.json({ data: responseData(request), meta: { protocolVersion: "nexum.runtime.v1", traceId } })
    },
  })

  const history = await adapter.loadHistory({ sessionID: "session_001", before: 10, limit: 20, snapshotID: "snapshot_001" })
  const state = await adapter.loadState("session_001")
  const events = []
  for await (const nextEvent of adapter.subscribeEvents({ sessionID: "session_001", afterSequence: 7 })) events.push(nextEvent)
  await adapter.listSkills()
  await adapter.sendMessage({ sessionID: "session_001", text: "继续处理" })
  await adapter.replyPermission({ sessionID: "session_001", requestID: "permission_001", decision: "allow_once" })
  await adapter.replyQuestion({ sessionID: "session_001", requestID: "question_001", answers: [["是"]] })
  await adapter.cancelQuestion({ sessionID: "session_001", requestID: "question_001" })
  await adapter.cancelRun("session_001")
  await adapter.continueRun("session_001")

  expect(history.snapshotID).toBe("snapshot_001")
  expect(state.session.id).toBe("session_001")
  expect(events).toEqual([event])
  expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
    ["GET", "/api/experimental/nexum/session/session_001/messages"],
    ["GET", "/api/nexum/session/session_001/state"],
    ["GET", "/api/nexum/session/session_001/events"],
    ["GET", "/api/nexum/skills"],
    ["POST", "/api/nexum/session/session_001/prompt"],
    ["POST", "/api/nexum/session/session_001/permission/permission_001/reply"],
    ["POST", "/api/nexum/session/session_001/question/question_001/reply"],
    ["POST", "/api/nexum/session/session_001/question/question_001/cancel"],
    ["POST", "/api/nexum/session/session_001/cancel"],
    ["POST", "/api/experimental/nexum/session/session_001/continue"],
  ])
  expect(new URL(requests[0]!.url).search).toBe("?before=10&limit=20&snapshot=snapshot_001")
  expect(new URL(requests[2]!.url).search).toBe("?afterSequence=7")
})

test("default adapter keeps stable Nexum error details", async () => {
  const adapter = createChatProtocolAdapter({
    fetch: async () =>
      Response.json(
        {
          errorCode: "SESSION_NOT_FOUND",
          message: "Session 不存在",
          traceId,
          meta: { protocolVersion: "nexum.runtime.v1", traceId },
        },
        { status: 404 },
      ),
  })

  await expect(adapter.loadState("missing")).rejects.toBeInstanceOf(ChatProtocolError)
  await expect(adapter.loadState("missing")).rejects.toMatchObject({
    status: 404,
    code: "SESSION_NOT_FOUND",
    traceId,
    message: "Session 不存在",
  })
})

function responseData(request: Request) {
  if (request.url.includes("/messages")) return { messages: [], total: 0, hasMore: false, snapshotID: "snapshot_001" }
  if (request.url.includes("/state")) {
    return {
      session: {
        id: "session_001",
        name: "测试 Session",
        directory: "/tmp/nexum",
        status: "idle",
        createdAt: "2026-11-24T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
      },
      pendingPermissions: [],
      pendingQuestions: [],
      canContinue: false,
      lastSequence: 7,
    }
  }
  if (request.url.includes("/skills")) return []
  return { status: "accepted" }
}
