import { expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { Nexum, type NexumEvent, type NexumSession } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { arrayLineSource, inputBoxLines, readlineLineSource, runRepl } from "../src/repl.ts"
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

test("repl Ctrl+C cancels a running session and exits when idle", async () => {
  const io = memoryIO()
  const { adapter, calls } = fakeAdapter({
    onSend: () => [makeEvent("assistant.thinking", { message: "思考" }, 1)],
  })
  let sigint: (() => void) | undefined
  let pending: ((line: string | null) => void) | undefined
  const queue = ["你好"]
  const lineSource = {
    next: () => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise<string | null>((resolve) => { pending = resolve })),
    close: () => {
      sigint = undefined
      pending?.(null)
    },
    setSigintHandler: (handler: () => void) => {
      sigint = handler
    },
  }
  const run = runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource, prompter: async () => "" })
  await new Promise((resolve) => setTimeout(resolve, 60))
  // 运行中 ^C → 取消运行,不退出
  sigint!()
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(calls).toContain("cancelRun")
  expect(io.plain()).toContain("已请求取消运行")
  // 空闲时 close(等价于空闲 ^C 触发 close)→ next  resolve null → REPL 退出
  lineSource.close()
  await run
})

test("repl reconnects after the event stream drops and resumes from the cursor", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  let subscriptions = 0
  adapter.subscribeEvents = async function* (input) {
    subscriptions += 1
    if (subscriptions === 1) {
      yield makeEvent("assistant.text", { content: "第一段" }, 1)
      throw new Error("连接断开")
    }
    yield makeEvent("assistant.text", { content: "第二段" }, 2)
    yield makeEvent("run.settled", { result: "completed" }, 3)
    while (!input.signal?.aborted) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["/quit"]), reconnectDelayMs: 10, prompter: async () => "" })
  const out = io.plain()
  expect(subscriptions).toBeGreaterThanOrEqual(2)
  expect(out).toContain("事件流已断开,3s 后重连…")
  expect(out).toContain("第二段")
  expect(out).toContain("✓ 运行完成")
})

test("repl send failure prints a notice and keeps the input loop alive", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  adapter.sendMessage = async () => {
    throw new Error("网络抖动")
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["你好", "/quit"]), prompter: async () => "" })
  expect(io.plain()).toContain("发送失败:网络抖动")
})

test("repl exits when the session cannot be opened", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  adapter.loadState = async () => {
    throw new Error("会话不存在")
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: arrayLineSource(["/quit"]), prompter: async () => "" })
  expect(io.plain()).toContain("会话打开失败:会话不存在")
})

test("inputBoxLines returns undefined for non-TTY and box strings for ansi16", () => {
  expect(inputBoxLines({ isTTY: false, color: "none", anim: false, theme: "dark" }, 80)).toBeUndefined()
  expect(inputBoxLines({ isTTY: true, color: "none", anim: false, theme: "dark" }, 80)).toBeUndefined()
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 80)!
  expect(box.top).toContain("╭")
  expect(box.top).toContain("╮")
  expect(box.hint).toContain("输入任务")
  expect(box.hint).toContain("/help 命令")
  expect(box.inputPrefix).toContain("›")
  expect(box.bottom).toContain("╰")
  expect(box.bottom).toContain("╯")
  expect(box.top).toContain("\x1b[36m")
})

function createTrackingClient(onCreate: (body: { name?: string }) => void) {
  return Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      if (request.method === "POST") {
        onCreate(JSON.parse(await request.text()) as { name?: string })
        return Response.json({ data: session, meta })
      }
      return Response.json({ data: [], meta })
    },
  })
}

test("repl without sessionID lazily creates the session on the first message", async () => {
  const io = memoryIO()
  const { adapter, sent } = fakeAdapter({
    onSend: () => [makeEvent("assistant.text", { content: "你好" }, 1), makeEvent("run.settled", { result: "completed" }, 2)],
  })
  const creates: (string | undefined)[] = []
  const client = createTrackingClient((body) => creates.push(body.name))
  await runRepl({ adapter, client, io, lineSource: slowLineSource(["你好", "/quit"]), prompter: async () => "" })
  expect(creates).toEqual([undefined])
  expect(sent).toEqual(["你好"])
  const out = io.plain()
  expect(out).toContain("新会话 · 发送第一条消息后创建(空会话不会产生垃圾)")
  expect(out).toContain(`会话 ${session.id} · 已创建`)
  expect(out).toContain("✓ 运行完成")
})

test("repl quitting without a message creates no session", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const creates: (string | undefined)[] = []
  const client = createTrackingClient((body) => creates.push(body.name))
  await runRepl({ adapter, client, io, lineSource: arrayLineSource(["/quit"]), prompter: async () => "" })
  expect(creates).toEqual([])
  expect(io.plain()).toContain("新会话 · 发送第一条消息后创建")
})

test("repl /new returns to pending state and names the next created session", async () => {
  const io = memoryIO()
  const { adapter, sent } = fakeAdapter({
    onSend: () => [makeEvent("run.settled", { result: "completed" }, 1)],
  })
  const creates: (string | undefined)[] = []
  const client = createTrackingClient((body) => creates.push(body.name))
  await runRepl({ adapter, client, io, lineSource: slowLineSource(["/new 改名", "第一条", "/quit"]), prompter: async () => "" })
  expect(creates).toEqual(["改名"])
  expect(sent).toEqual(["第一条"])
  expect(io.plain()).toContain(`会话 ${session.id} · 已创建`)
})

test("repl session-dependent slash commands warn before the session exists", async () => {
  const io = memoryIO()
  const { adapter, calls } = fakeAdapter({})
  await runRepl({ adapter, client: fakeClient(), io, lineSource: arrayLineSource(["/cancel", "/continue", "/quit"]), prompter: async () => "" })
  expect(io.plain().match(/会话尚未创建,发送第一条消息后可用/g)?.length).toBe(2)
  expect(calls).not.toContain("cancelRun")
  expect(calls).not.toContain("continueRun")
})

test("repl silently resubscribes when the stream ends after a terminal state", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  let subscriptions = 0
  adapter.subscribeEvents = async function* (input) {
    subscriptions += 1
    if (subscriptions === 1) {
      yield makeEvent("assistant.text", { content: "第一段" }, 1)
      yield makeEvent("run.settled", { result: "completed" }, 2)
      return
    }
    while (!input.signal?.aborted) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["/quit"]), reconnectDelayMs: 10, prompter: async () => "" })
  expect(subscriptions).toBeGreaterThanOrEqual(2)
  expect(io.plain()).not.toContain("事件流已断开")
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

test("readlineLineSource draws the box on showPrompt and closes it on submit", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 60)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.showPrompt?.()
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(rendered.match(/╭/g)?.length).toBe(1)
  expect(rendered).toContain("输入任务")
  const line = source.next()
  input.write("你好\n")
  expect(await line).toBe("你好")
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(rendered).toContain("╰")
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(rendered.match(/╭/g)?.length).toBe(2)
  source.close()
})
