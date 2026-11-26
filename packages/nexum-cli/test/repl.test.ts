import { expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { Nexum, type NexumEvent, type NexumSession } from "@nexum/client"
import type { ChatProtocolAdapter } from "@nexum/surface-adapter"
import { arrayLineSource, inputBoxLines, readlineLineSource, runRepl } from "../src/repl.ts"
import { createIO, memoryIO } from "../src/io.ts"
import { displayWidth } from "../src/term.ts"

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
  return { adapter, sent, calls, queued }
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

test("repl prints the permission outcome before replying and resumes the tool line", async () => {
  const io = memoryIO({ anim: true })
  const { adapter, calls, queued } = fakeAdapter({
    onSend: () => [
      makeEvent("tool.request", { toolCallID: "t1", toolName: "read" }, 1),
      makeEvent("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 2),
    ],
  })
  let outputAtReply = ""
  adapter.replyPermission = async () => {
    calls.push("replyPermission")
    outputAtReply = io.plain()
    // 服务器在收到回复后才执行工具:tool.result 只可能在回复之后到达
    queued.push(makeEvent("tool.result", { toolCallID: "t1", toolName: "read", ok: true, output: "完成" }, 3), makeEvent("run.settled", { result: "completed" }, 4))
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["改文件", "/quit"]), prompter: async () => "1" })
  expect(calls).toContain("replyPermission")
  // 结果行先于 HTTP 回复打印,回复时工具结果尚未渲染
  expect(outputAtReply).toContain("权限已通过")
  expect(outputAtReply).not.toContain("✓ 工具结果")
  const out = io.plain()
  expect(out.indexOf("等待权限确认")).toBeLessThan(out.indexOf("权限已通过"))
  expect(out.indexOf("权限已通过")).toBeLessThan(out.indexOf("执行中"))
  expect(out.indexOf("执行中")).toBeLessThan(out.indexOf("✓ 工具结果 read"))
})

test("repl does not resume the tool line when permission is denied", async () => {
  const io = memoryIO({ anim: true })
  const { adapter, calls, queued } = fakeAdapter({
    onSend: () => [
      makeEvent("tool.request", { toolCallID: "t1", toolName: "read" }, 1),
      makeEvent("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 2),
    ],
  })
  adapter.replyPermission = async () => {
    calls.push("replyPermission")
    // 拒绝后服务器失败本次运行:tool.result(ok:false) 随后 run.settled(failed)
    queued.push(makeEvent("tool.result", { toolCallID: "t1", toolName: "read", ok: false, output: "权限被拒" }, 3), makeEvent("run.settled", { result: "failed" }, 4))
  }
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["改文件", "/quit"]), prompter: async () => "3" })
  expect(calls).toContain("replyPermission")
  const out = io.plain()
  expect(out).toContain("权限已拒绝")
  // 拒绝后不恢复执行行,避免闪现误导性的"执行中"
  expect(out).not.toContain("执行中")
  expect(out).toContain("✗ 工具结果 read")
  expect(out).toContain("✗ 运行失败")
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
  expect(io.plain()).not.toContain("测试驱动")
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
  const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "")
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 80)!
  expect(box.top).toContain("╭")
  expect(box.top).toContain("╮")
  expect(box.hint).toContain("输入任务")
  expect(box.hint).toContain("/help 命令")
  expect(box.inputPrefix).toContain("›")
  expect(plain(box.spacer)).toBe("│ ")
  expect(box.bottom).toContain("╰")
  expect(box.bottom).toContain("╯")
  expect(box.top).toContain("\x1b[36m")
  // 宽度:columns - 4,上限 110,下限 44
  expect(plain(box.top)).toHaveLength(76)
  expect(plain(inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 130)!.top)).toHaveLength(110)
  expect(plain(inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 40)!.top)).toHaveLength(44)
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

test("readlineLineSource draws a closed box on showPrompt and moves the cursor below it on submit", async () => {
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
  // 空闲即完整闭合:顶边 → 提示行 → 输入行 → 留白行 → 底边,随后光标上移两行归位到输入行
  expect(rendered.match(/╭/g)?.length).toBe(1)
  expect(rendered.match(/╰/g)?.length).toBe(1)
  const plainRendered = rendered.replace(/\x1b\[[0-9;]*m/g, "")
  expect(plainRendered.indexOf("输入任务")).toBeGreaterThan(plainRendered.indexOf("╭"))
  expect(plainRendered.indexOf("│ ›")).toBeGreaterThan(plainRendered.indexOf("输入任务"))
  // 留白行(仅左边界)紧邻底边之上
  expect(plainRendered).toContain("│ \n╰")
  expect(rendered).toContain("\x1b[2A\r")
  expect(rendered.lastIndexOf("\x1b[2A")).toBeGreaterThan(rendered.lastIndexOf("╰"))
  const line = source.next()
  input.write("你好\n")
  expect(await line).toBe("你好")
  await new Promise((resolve) => setTimeout(resolve, 20))
  // 提交后光标移到底边之下(留白→底边→框外,两行位移),框保持闭合
  expect(rendered).toContain("\x1b[2B")
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(rendered.match(/╭/g)?.length).toBe(2)
  expect(rendered.match(/╰/g)?.length).toBe(2)
  source.close()
})

test("readlineLineSource rewrites readline clear-to-screen-end sequences so edits keep the box bottom", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 60)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.showPrompt?.()
  const line = source.next()
  input.write("abc")
  await new Promise((resolve) => setTimeout(resolve, 30))
  // 退格触发 readline 全行重绘;^[[0J(清到屏尾)会抹掉底边,必须被改写为 ^[[0K(清到行尾)
  input.write("\x7f")
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(rendered).not.toContain("\x1b[0J")
  expect(rendered).toContain("\x1b[0K")
  input.write("\n")
  expect(await line).toBe("ab")
  source.close()
})

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** 渲染输出与输入框共用同一流,断言两者相对顺序;ANSI 颜色序列剥离后比较。 */
function boxHarness() {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 60)!
  const source = readlineLineSource(() => [], { input, output, box })
  const io = createIO({ caps: { isTTY: true, color: "none", anim: false, theme: "dark" }, out: output })
  const plain = () => rendered.replace(/\x1b\[[0-9;]*m/g, "")
  return { input, source, io, plain }
}

test("repl does not stick the settle line to the input box on double terminal events", async () => {
  const { input, source, io, plain } = boxHarness()
  // 真实服务器顺序:session.completed 先于 run.settled(publishTerminalEvents)
  const { adapter } = fakeAdapter({
    onSend: () => [makeEvent("session.completed", {}, 1), makeEvent("run.settled", { result: "completed" }, 2)],
  })
  const run = runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: source, prompter: async () => "" })
  await waitFor(() => plain().includes("│ ›"))
  input.write("你好\n")
  await waitFor(() => plain().includes("✓ 运行完成"))
  await waitFor(() => (plain().match(/╭/g)?.length ?? 0) >= 2)
  source.close()
  await run
  const text = plain()
  const bottom = text.indexOf("╰")
  const settled = text.indexOf("✓ 运行完成")
  expect(bottom).toBeGreaterThanOrEqual(0)
  expect(settled).toBeGreaterThan(bottom)
  // 终态行必须落在新框顶边之前,不粘在 │ › 输入行后面
  expect(text.indexOf("╭", settled)).toBeGreaterThan(settled)
  // 每个框完整闭合:顶边数 = 底边数;结束后光标归位序列在最后一个底边之后(光标停在框内)
  expect(text.match(/╭/g)?.length).toBe(2)
  expect(text.match(/╰/g)?.length).toBe(2)
  expect(text.lastIndexOf("\x1b[2A")).toBeGreaterThan(text.lastIndexOf("╰"))
})

test("repl redraws the input box after an empty line submit", async () => {
  const { input, source, io, plain } = boxHarness()
  const { adapter } = fakeAdapter({})
  const run = runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: source, prompter: async () => "" })
  await waitFor(() => (plain().match(/╭/g)?.length ?? 0) === 1)
  input.write("\n")
  await waitFor(() => (plain().match(/╭/g)?.length ?? 0) >= 2)
  source.close()
  await run
  const text = plain()
  // 空行提交闭合旧框并重画新框:两对顶边/底边,光标归位在框内
  expect(text.match(/╰/g)?.length).toBe(2)
  expect(text.match(/╭/g)?.length).toBe(2)
  expect(text.lastIndexOf("\x1b[2A")).toBeGreaterThan(text.lastIndexOf("╰"))
})

/** 带权限策略内存状态的 fake client:GET 列表 / POST 创建 / DELETE 删除。 */
function policyClient() {
  const rules: { id: string; action: string; resource: string; effect: string; scope: string; createdAt: string; updatedAt: string }[] = []
  const lists: number[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      if (request.method === "GET") {
        lists.push(1)
        return Response.json({ data: { rules, defaultEffect: "ask" }, meta })
      }
      if (request.method === "POST") {
        const body = JSON.parse(await request.text()) as { action: string; resource: string; effect: string; scope: string }
        const created = { id: `rule_${String(rules.length + 1).padStart(3, "0")}`, createdAt: "", updatedAt: "", ...body }
        rules.push(created)
        return Response.json({ data: created, meta })
      }
      return Response.json({ data: {}, meta })
    },
  })
  return { client, rules, lists }
}

function statusLineSource(lines: readonly string[]) {
  const queue = [...lines]
  const statuses: string[] = []
  return {
    statuses,
    next: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return queue.length > 0 ? queue.shift()! : null
    },
    close: () => {},
    setStatus: (text: string) => statuses.push(text),
  }
}

test("repl /permissions lists rules, switches mode and refreshes the box status", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const { client, rules } = policyClient()
  const lineSource = statusLineSource(["/permissions", "/permissions mode allow", "/permissions", "/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  // 初始 ask,mode allow 后刷新为 allow · 1 规则
  expect(lineSource.statuses[0]).toBe("未配置模型 · 权限:ask")
  expect(lineSource.statuses.at(-1)).toBe("未配置模型 · 权限:allow · 1 规则")
  expect(rules[0]).toMatchObject({ action: "*", resource: "*", effect: "allow", scope: "global" })
  const out = io.plain()
  expect(out).toContain("暂无规则,全部操作逐次询问")
  expect(out).toContain("✓ 权限模式已切换 ask → allow(危险操作仍会询问)")
  expect(out).toContain("← 当前模式")
})

test("repl refreshes the permission status after a permission-card reply", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({
    onSend: () => [
      makeEvent("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 1),
      makeEvent("run.settled", { result: "completed" }, 2),
    ],
  })
  const { client, lists } = policyClient()
  const lineSource = statusLineSource(["改文件", "/quit"])
  // 始终允许:服务器端会写入规则,回复成功后必须重新拉取状态
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "2" })
  expect(io.plain()).toContain("权限已通过")
  expect(lists.length).toBeGreaterThanOrEqual(2)
  expect(lineSource.statuses.length).toBeGreaterThanOrEqual(2)
})

test("readlineLineSource right-aligns the status segment on the hint row", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 120)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.setStatus?.("权限:allow · 1 规则")
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const hintLine = rendered.split("\n").find((line) => line.includes("输入任务"))!
  const plainHint = hintLine.replace(/\x1b\[[0-9;]*m/g, "")
  expect(plainHint.endsWith("权限:allow · 1 规则")).toBe(true)
  // 提示行显示宽度与顶边一致(状态段右对齐到框宽)
  expect(displayWidth(plainHint)).toBe(displayWidth(box.top.replace(/\x1b\[[0-9;]*m/g, "")))
  source.close()
})

test("readlineLineSource drops the status segment when the box is too narrow to fit it", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 60)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.setStatus?.("权限:allow · 1 规则")
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const hintLine = rendered.split("\n").find((line) => line.includes("输入任务"))!
  expect(hintLine).toBe(box.hint)
  source.close()
})

test("readlineLineSource without status keeps the plain hint row", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 80)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const hintLine = rendered.split("\n").find((line) => line.includes("输入任务"))!
  expect(hintLine).toBe(box.hint)
  source.close()
})

test("repl /thinking switches between live, summary and full modes", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  await runRepl({
    adapter,
    client: fakeClient(),
    io,
    sessionID: session.id,
    lineSource: arrayLineSource(["/thinking full", "/thinking summary", "/thinking live", "/thinking", "/quit"]),
    prompter: async () => "",
  })
  const out = io.plain()
  expect(out).toContain("思考展示:full")
  expect(out).toContain("思考展示:summary")
  // 显式 live 与缺省参数都切到 live
  expect(out.match(/思考展示:live/g)?.length).toBe(2)
})

test("repl slash commands collapse the live thinking region before printing", async () => {
  const io = memoryIO({ anim: true })
  const { adapter } = fakeAdapter({
    onSend: () => [makeEvent("assistant.reasoning", { content: "推理行一\n推理行二\n" }, 1)],
  })
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["你好", "/events", "/quit"]), prompter: async () => "" })
  const out = io.plain()
  // 思考区先收起为摘要,/events 输出完整落在区域外
  expect(out).toContain("✓ 思考过程 · 10 字")
  expect(out.indexOf("✓ 思考过程")).toBeLessThan(out.indexOf("assistant.reasoning"))
})

test("repl SIGINT cancel notice collapses the live thinking region before printing", async () => {
  const io = memoryIO({ anim: true })
  const { adapter, calls } = fakeAdapter({
    onSend: () => [makeEvent("assistant.reasoning", { content: "取消前的推理行\n" }, 1)],
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
  sigint!()
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(calls).toContain("cancelRun")
  lineSource.close()
  await run
  const out = io.plain()
  // 思考区先收起为摘要,取消提示完整落在区域外
  expect(out).toContain("✓ 思考过程 · 8 字")
  expect(out.indexOf("✓ 思考过程")).toBeLessThan(out.indexOf("已请求取消运行(Ctrl+C)"))
})

test("repl locked warning collapses the live thinking region before printing", async () => {
  const io = memoryIO({ anim: true })
  const { adapter } = fakeAdapter({
    onSend: () => [makeEvent("assistant.reasoning", { content: "锁定前的推理行\n" }, 1)],
  })
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: slowLineSource(["你好", "第二条消息", "/quit"]), prompter: async () => "" })
  const out = io.plain()
  expect(out).toContain("✓ 思考过程 · 8 字")
  expect(out.indexOf("✓ 思考过程")).toBeLessThan(out.indexOf("Agent 正在回复,/cancel 取消本轮"))
})

test("readlineLineSource completes slash command names with prefix and fuzzy matching", async () => {
  // 前缀补全:/sk → /skills
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/sk\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/skills ")
    source.close()
  }
  // 前缀补全:/perm → /permissions
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/perm\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/permissions ")
    source.close()
  }
  // 模糊补全(非前缀子串):/xpand → /expand
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/xpand\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/expand ")
    source.close()
  }
  // / + Tab 列出全部命令(公共前缀无进展时再按一次 Tab 打印候选列表)
  {
    const { input, source, rendered } = ttySource()
    void source.next()
    input.write("/\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    const out = rendered()
    for (const name of ["/help", "/sessions", "/skills", "/permissions", "/thinking", "/expand", "/quit"]) expect(out).toContain(name)
    source.close()
  }
  // 非命令上下文(@skill)不受影响
  {
    const { input, source } = ttySource(["tdd"])
    const line = source.next()
    input.write("用 @td\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("用 @tdd ")
    source.close()
  }
})

test("readlineLineSource completes subcommands for /permissions and /thinking only", async () => {
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/thinking l\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/thinking live ")
    source.close()
  }
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/permissions mo\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/permissions mode ")
    source.close()
  }
  // 无子命令的命令不补全第二个 token
  {
    const { input, source } = ttySource()
    const line = source.next()
    input.write("/skills x\t")
    await new Promise((resolve) => setTimeout(resolve, 50))
    input.write("\n")
    expect(await line).toBe("/skills x")
    source.close()
  }
})

test("repl /help lists every slash command", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  await runRepl({ adapter, client: fakeClient(), io, sessionID: session.id, lineSource: arrayLineSource(["/help", "/quit"]), prompter: async () => "" })
  const out = io.plain()
  for (const name of ["help", "new", "sessions", "use", "resume", "status", "skills", "mcp", "model", "theme", "permissions", "events", "clear", "cancel", "continue", "thinking", "expand", "quit"]) {
    expect(out).toContain(`/${name}`)
  }
})

/** 模型配置可编程的 fake client:GET /model 返回给定配置(null=未配置,"fail"=请求失败),权限列表恒空。 */
function modelClient(model: { baseUrl: string; model: string; credentialConfigured: boolean } | null | "fail") {
  const gets: number[] = []
  const client = Nexum.make({
    baseUrl: "http://nexum.test",
    fetch: async (input, init) => {
      const request = new Request(typeof input === "string" ? input : input.toString(), init)
      if (request.method === "GET" && request.url.endsWith("/model")) {
        gets.push(1)
        if (model === "fail") throw new Error("连接失败")
        return Response.json({ data: model, meta })
      }
      if (request.method === "GET") return Response.json({ data: { rules: [], defaultEffect: "ask" }, meta })
      return Response.json({ data: {}, meta })
    },
  })
  return { client, gets }
}

test("repl box status shows the configured model name before the permission segment", async () => {
  const io = memoryIO({ color: "ansi16" })
  const { adapter } = fakeAdapter({})
  const { client } = modelClient({ baseUrl: "http://api.test", model: "deepseek-v4-pro", credentialConfigured: true })
  const lineSource = statusLineSource(["/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  const status = lineSource.statuses.at(-1)!
  expect(status).toContain("\x1b[36mdeepseek-v4-pro\x1b[0m")
  expect(status.replace(/\x1b\[[0-9;]*m/g, "")).toContain("权限:ask")
  expect(status.indexOf("deepseek-v4-pro")).toBeLessThan(status.indexOf("权限:"))
})

test("repl box status shows a yellow 未配置模型 when no model is configured", async () => {
  const io = memoryIO({ color: "ansi16" })
  const { adapter } = fakeAdapter({})
  const { client } = modelClient(null)
  const lineSource = statusLineSource(["/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  const status = lineSource.statuses.at(-1)!
  expect(status).toContain("\x1b[33m未配置模型\x1b[0m")
  expect(status.replace(/\x1b\[[0-9;]*m/g, "")).toContain("权限:ask")
})

test("repl box status falls back to permission-only when the model fetch fails", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const { client } = modelClient("fail")
  const lineSource = statusLineSource(["/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  expect(lineSource.statuses.at(-1)).toBe("权限:ask")
})

test("repl /model refreshes the model segment after displaying", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const { client, gets } = modelClient({ baseUrl: "http://api.test", model: "qwen3-max", credentialConfigured: true })
  const lineSource = statusLineSource(["/model", "/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  // 启动一次 + /model 后刷新一次
  expect(gets.length).toBeGreaterThanOrEqual(2)
  expect(io.plain()).toContain("qwen3-max")
  expect(lineSource.statuses.at(-1)).toContain("qwen3-max · 权限:ask")
})

test("composed model + permission status stays on the hint row at 80 columns", async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ""
  output.on("data", (chunk) => {
    rendered += chunk.toString()
  })
  const box = inputBoxLines({ isTTY: true, color: "ansi16", anim: true, theme: "dark" }, 80)!
  const source = readlineLineSource(() => [], { input, output, box })
  source.setStatus?.("deepseek-v4-pro · 权限:ask")
  source.showPrompt?.()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const hintLine = rendered.split("\n").find((line) => line.includes("输入任务"))!
  const plainHint = hintLine.replace(/\x1b\[[0-9;]*m/g, "")
  // 状态段未被丢弃,且提示行整体不超出框宽
  expect(plainHint.endsWith("deepseek-v4-pro · 权限:ask")).toBe(true)
  expect(displayWidth(plainHint)).toBe(displayWidth(box.top.replace(/\x1b\[[0-9;]*m/g, "")))
  source.close()
})

test("repl /permissions refreshes only the permission segment, not the model", async () => {
  const io = memoryIO()
  const { adapter } = fakeAdapter({})
  const { client, gets } = modelClient(null)
  const lineSource = statusLineSource(["/permissions", "/quit"])
  await runRepl({ adapter, client, io, sessionID: session.id, lineSource, prompter: async () => "" })
  // 权限命令不改变模型配置:模型 GET 只有启动时的一次
  expect(gets.length).toBe(1)
  expect(lineSource.statuses.at(-1)).toContain("权限:ask")
})
