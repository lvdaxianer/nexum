import { expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { Nexum, type NexumEvent, type NexumSession } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { arrayLineSource, readlineLineSource, runRepl } from "../src/repl.ts"
import { memoryIO } from "../src/io.ts"

const session: NexumSession = {
  id: "session_001",
  name: "测试",
  directory: "/tmp/nexum",
  status: "idle",
  createdAt: "2026-11-24T00:00:00.000Z",
  updatedAt: "2026-11-24T00:00:00.000Z",
}

const meta = { protocolVersion: "nexum.runtime.v1", traceId: "trace_test" } as const

function fakeClient(data: unknown = []) {
  return Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async () => Response.json({ data, meta }),
  })
}

function makeEvent(type: NexumEvent["type"], data: Record<string, unknown>, sequence: number): NexumEvent {
  return { eventID: `e${sequence}`, runID: "run_001", type, sessionID: session.id, sequence, occurredAt: "2026-11-24T00:00:00.000Z", data } as NexumEvent
}

function fakeAdapter(script: { events?: NexumEvent[]; onSend?: (text: string) => NexumEvent[] }) {
  const sent: string[] = []
  const calls: string[] = []
  const queued = [...(script.events ?? [])]
  const adapter: ChatProtocolAdapter = {
    loadHistory: async () => ({ messages: [{ index: 1, message: { role: "user", content: "历史问题" } }], total: 1, hasMore: false, snapshotID: "snap" }),
    loadState: async () => ({ session, canContinue: false, pendingPermissions: [], pendingQuestions: [], lastSequence: 0 }),
    subscribeEvents: async function* (input) {
      while (!input.signal?.aborted) {
        if (queued.length > 0) {
          yield queued.shift()!
          continue
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    },
    listSkills: async () => [],
    sendMessage: async ({ text }) => {
      sent.push(text)
      calls.push("send")
      queued.push(...(script.onSend?.(text) ?? []))
    },
    replyPermission: async () => {
      calls.push("replyPermission")
    },
    replyQuestion: async () => {
      calls.push("replyQuestion")
    },
    cancelQuestion: async () => {},
    cancelRun: async () => {
      calls.push("cancelRun")
    },
    continueRun: async () => {
      calls.push("continueRun")
    },
  }
  return { adapter, sent, calls }
}

/** 每次取行前等待 30ms,给事件泵留出消费时间,避免测试竞态。 */
function slowLineSource(lines: readonly string[]) {
  const queue = [...lines]
  return {
    next: async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return queue.length > 0 ? queue.shift()! : null
    },
    close: () => {},
  }
}

test("repl prints history, sends prompt and renders run events", async () => {
  const io = memoryIO()
  const { adapter, sent } = fakeAdapter({
    onSend: () => [makeEvent("assistant.text", { content: "你好" }, 1), makeEvent("run.settled", { result: "completed" }, 2)],
  })
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["你好", "/quit"]), prompter: async () => "" })
  expect(sent).toEqual(["你好"])
  const out = io.plain()
  expect(out).toContain("历史问题")
  expect(out).toContain("你好")
  expect(out).toContain("✓ 运行完成")
})

test("repl answers permission requests through the prompter", async () => {
  const io = memoryIO()
  const { adapter, calls } = fakeAdapter({
    onSend: () => [
      makeEvent("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 1),
      makeEvent("run.settled", { result: "completed" }, 2),
    ],
  })
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["改文件", "/quit"]), prompter: async () => "1" })
  expect(calls).toContain("replyPermission")
  expect(io.plain()).toContain("权限已通过")
})

test("repl slash commands: /skills lists ready skills, /cancel calls cancelRun, unknown command warns", async () => {
  const io = memoryIO()
  const { adapter, calls } = fakeAdapter({})
  adapter.listSkills = async () => [
    { id: "tdd", name: "tdd", description: "测试驱动", digest: "d", fileCount: 1, files: [], status: "ready", diagnostics: [] },
    { id: "broken", name: "broken", description: "坏", digest: "d", fileCount: 1, files: [], status: "invalid", diagnostics: [] },
  ]
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: arrayLineSource(["/skills", "/cancel", "/nope", "/quit"]), prompter: async () => "" })
  expect(io.plain()).toContain("@tdd")
  expect(io.plain()).not.toContain("@broken")
  expect(calls).toContain("cancelRun")
  expect(io.plain()).toContain("未知命令")
})

test("repl /resume switches session and replays its history", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const client = fakeClient([{ id: "session_002", name: "另一个", directory: "/tmp", status: "idle", createdAt: "", updatedAt: "2026-11-24T10:00:00Z" }])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource: slowLineSource(["/resume", "/quit"]), prompter: async () => "1" })
  const out = io.plain()
  expect(out).toContain("选择会话")
  expect(out.match(/已回放历史/g)?.length).toBe(2)
})

function ttySource(skills: string[] = []) {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const source = readlineLineSource(() => skills, { input, output })
  return { input, source, rendered: () => rendered }
}

test("readlineLineSource serializes main prompt and interaction prompt without deadlock", async () => {
  const { input, source } = ttySource()
  const first = source.next()
  const decision = source.prompter("选择 › ")
  input.write("1\n")
  expect(await decision).toBe("1")
  input.write("继续输入\n")
  expect(await first).toBe("继续输入")
  source.close()
  expect(await source.next()).toBe(null)
})

test("readlineLineSource completes @skill tokens in place", async () => {
  const { input, source } = ttySource(["tdd"])
  const line = source.next()
  input.write("用 @td\t")
  await new Promise((resolve) => setTimeout(resolve, 50))
  input.write("\n")
  expect(await line).toBe("用 @tdd ")
  source.close()
})
