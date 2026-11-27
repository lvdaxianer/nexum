import { expect, test } from "bun:test"
import { Nexum } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { cmdPrompt, cmdResume, cmdSessionCreate, cmdSessionDelete, cmdSessionList, latestSessionID } from "../src/commands.ts"
import { memoryIO } from "../src/io.ts"

const meta = { protocolVersion: "nexum.runtime.v1", traceId: "trace_test" } as const

function fakeClient(handler: (request: Request) => unknown) {
  return Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      return Response.json({ data: handler(request), meta })
    },
  })
}

function fakeAdapter(events: { type: string; data: Record<string, unknown> }[]): ChatProtocolAdapter {
  return {
    loadHistory: async () => ({ messages: [], total: 0, hasMore: false, snapshotID: "snap" }),
    loadState: async () => ({ session: { id: "s1", name: "s", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }, canContinue: false, canCancel: false, pendingPermissions: [], pendingQuestions: [], lastSequence: 0 }),
    subscribeEvents: async function* () {
      for (const [index, event] of events.entries()) {
        yield { eventID: `e${index}`, runID: "r1", sessionID: "s1", sequence: index + 1, occurredAt: "", ...event } as never
      }
    },
    listSkills: async () => [],
    sendMessage: async () => {},
    replyPermission: async () => {},
    replyQuestion: async () => {},
    cancelQuestion: async () => {},
    cancelRun: async () => {},
    continueRun: async () => {},
  }
}

test("cmdSessionList prints a table with colored status", async () => {
  const io = memoryIO()
  const client = fakeClient(() => [
    { id: "7f3a9c21aa", name: "login-重试", directory: "/work/app", status: "completed", mode: "build", createdAt: "", updatedAt: "2026-11-24T10:00:00Z" },
    { id: "b2e91d04bb", name: "api-重构", directory: "/work/api", status: "idle", mode: "build", createdAt: "", updatedAt: "2026-11-24T09:00:00Z" },
  ])
  await cmdSessionList(client, io)
  const out = io.plain()
  expect(out).toContain("ID")
  expect(out).toContain("7f3a9c21")
  expect(out).toContain("login-重试")
  expect(out).toContain("已完成")
  expect(out).toContain("空闲")
})

test("cmdSessionCreate prints the created session id", async () => {
  const io = memoryIO()
  const client = fakeClient(() => ({ id: "new_session_1", name: "x", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }))
  await cmdSessionCreate(client, io, { directory: "/tmp" })
  expect(io.plain()).toContain("new_session_1")
})

test("latestSessionID returns the most recently updated session, undefined when empty", async () => {
  const client = fakeClient(() => [
    { id: "old", name: "", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "2026-11-20T00:00:00Z" },
    { id: "new", name: "", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "2026-11-24T00:00:00Z" },
  ])
  expect(await latestSessionID(client)).toBe("new")
  expect(await latestSessionID(fakeClient(() => []))).toBeUndefined()
})

test("cmdSessionDelete deletes by id and prints it", async () => {
  const io = memoryIO()
  const calls: string[] = []
  const client = fakeClient((request) => {
    calls.push(`${request.method} ${new URL(request.url).pathname}`)
    return { id: "s1", deleted: true }
  })
  await cmdSessionDelete(client, io, "s1")
  expect(calls).toEqual(["DELETE /api/nexum/session/s1"])
  expect(io.plain()).toContain("已删除会话")
  expect(io.plain()).toContain("s1")
})

test("cmdResume lists sessions and returns the picked id", async () => {
  const io = memoryIO()
  const client = fakeClient(() => [
    { id: "7f3a9c21aa", name: "login-重试", directory: "/work/app", status: "completed", mode: "build", createdAt: "", updatedAt: "2026-11-24T10:00:00Z" },
    { id: "b2e91d04bb", name: "api-重构", directory: "/work/api", status: "idle", mode: "build", createdAt: "", updatedAt: "2026-11-24T09:00:00Z" },
  ])
  const picked = await cmdResume(client, io, async () => "2")
  expect(picked).toBe("b2e91d04bb")
  expect(io.plain()).toContain("选择会话")
  const invalid = await cmdResume(client, io, async () => "9")
  expect(invalid).toBeUndefined()
  const empty = await cmdResume(fakeClient(() => []), io, async () => "1")
  expect(empty).toBeUndefined()
})

test("cmdPrompt streams events and maps run result to exit codes", async () => {
  const io = memoryIO()
  const client = fakeClient(() => ({ id: "s_new", name: "", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }))
  const completed = await cmdPrompt({ client, adapter: fakeAdapter([{ type: "assistant.text", data: { content: "你好" } }, { type: "run.settled", data: { result: "completed" } }]), io, prompter: async () => "", text: "hi", directory: "/tmp" })
  expect(completed).toBe(0)
  const failed = await cmdPrompt({ client, adapter: fakeAdapter([{ type: "run.settled", data: { result: "failed" } }]), io, prompter: async () => "", text: "hi", sessionID: "s1", directory: "/tmp" })
  expect(failed).toBe(1)
  const cancelled = await cmdPrompt({ client, adapter: fakeAdapter([{ type: "run.settled", data: { result: "cancelled" } }]), io, prompter: async () => "", text: "hi", sessionID: "s1", directory: "/tmp" })
  expect(cancelled).toBe(130)
  expect(io.plain()).toContain("你好")
})

test("cmdPrompt prints the permission outcome before replying and renders tool.result after the pause", async () => {
  const io = memoryIO({ anim: true })
  const client = fakeClient(() => ({ id: "s1", name: "", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }))
  let outputAtReply = ""
  const adapter: ChatProtocolAdapter = {
    loadHistory: async () => ({ messages: [], total: 0, hasMore: false, snapshotID: "snap" }),
    loadState: async () => ({ session: { id: "s1", name: "s", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "", }, canContinue: false, canCancel: false, pendingPermissions: [], pendingQuestions: [], lastSequence: 0 }),
    subscribeEvents: async function* () {
      yield { eventID: "e1", runID: "r1", sessionID: "s1", sequence: 1, occurredAt: "", type: "tool.request", data: { toolCallID: "t1", toolName: "read" } } as never
      yield { eventID: "e2", runID: "r1", sessionID: "s1", sequence: 2, occurredAt: "", type: "permission.requested", data: { requestID: "p1", action: "edit", resource: "a.ts" } } as never
      // 生成器是惰性的:tool.result 只在权限回复完成、循环继续后才被消费,模拟服务器收到回复才执行工具
      yield { eventID: "e3", runID: "r1", sessionID: "s1", sequence: 3, occurredAt: "", type: "tool.result", data: { toolCallID: "t1", toolName: "read", ok: true, output: "完成" } } as never
      yield { eventID: "e4", runID: "r1", sessionID: "s1", sequence: 4, occurredAt: "", type: "run.settled", data: { result: "completed" } } as never
    },
    listSkills: async () => [],
    sendMessage: async () => {},
    replyPermission: async () => {
      outputAtReply = io.plain()
    },
    replyQuestion: async () => {},
    cancelQuestion: async () => {},
    cancelRun: async () => {},
    continueRun: async () => {},
  }
  const code = await cmdPrompt({ client, adapter, io, prompter: async () => "1", text: "hi", sessionID: "s1", directory: "/tmp" })
  expect(code).toBe(0)
  // 结果行先于 HTTP 回复打印
  expect(outputAtReply).toContain("权限已通过")
  expect(outputAtReply).not.toContain("✓ 工具结果")
  const out = io.plain()
  expect(out.indexOf("等待权限确认")).toBeLessThan(out.indexOf("权限已通过"))
  expect(out.indexOf("权限已通过")).toBeLessThan(out.indexOf("执行中"))
  expect(out.indexOf("执行中")).toBeLessThan(out.indexOf("✓ 工具结果 read"))
})

test("cmdPrompt auto-denies permission and auto-cancels question when not TTY", async () => {
  const io = memoryIO({ isTTY: false })
  const replies: string[] = []
  const adapter: ChatProtocolAdapter = {
    loadHistory: async () => ({ messages: [], total: 0, hasMore: false, snapshotID: "snap" }),
    loadState: async () => ({ session: { id: "s1", name: "s", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }, canContinue: false, canCancel: false, pendingPermissions: [], pendingQuestions: [], lastSequence: 0 }),
    subscribeEvents: async function* () {
      yield { eventID: "e1", runID: "r1", sessionID: "s1", sequence: 1, occurredAt: "", type: "permission.requested", data: { requestID: "p1", action: "edit", resource: "a.ts" } } as never
      yield { eventID: "e2", runID: "r1", sessionID: "s1", sequence: 2, occurredAt: "", type: "question.request", data: { requestID: "q1", toolCallID: "t1", questions: [{ header: "h", question: "q?", options: [{ label: "A", description: "" }] }] } } as never
      yield { eventID: "e3", runID: "r1", sessionID: "s1", sequence: 3, occurredAt: "", type: "run.settled", data: { result: "completed" } } as never
    },
    listSkills: async () => [],
    sendMessage: async () => {},
    replyPermission: async ({ decision }) => {
      replies.push(`permission:${decision}`)
    },
    replyQuestion: async () => {
      replies.push("question:reply")
    },
    cancelQuestion: async () => {
      replies.push("question:cancel")
    },
    cancelRun: async () => {},
    continueRun: async () => {},
  }
  const client = fakeClient(() => ({ id: "s1", name: "", directory: "/tmp", status: "idle", mode: "build", createdAt: "", updatedAt: "" }))
  const code = await cmdPrompt({ client, adapter, io, prompter: async () => "1", text: "hi", sessionID: "s1", directory: "/tmp" })
  expect(code).toBe(0)
  expect(replies).toEqual(["permission:deny", "question:cancel"])
  expect(io.plain()).toContain("非交互环境,权限已自动拒绝")
  expect(io.plain()).toContain("非交互环境,补充信息已取消")
})
