import { expect, test } from "bun:test"
import type { NexumEvent } from "@nexum/client"
import { createRenderer, historyLines } from "../src/render.ts"
import { memoryIO } from "../src/io.ts"

function event(type: NexumEvent["type"], data: Record<string, unknown>, sequence: number): NexumEvent {
  return {
    eventID: `event_${sequence}`,
    runID: "run_001",
    type,
    sessionID: "session_001",
    sequence,
    occurredAt: "2026-11-24T00:00:00.000Z",
    data,
  } as NexumEvent
}

test("renderer projects a full run: thinking collapse, agent text, tool settle, run settled", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.thinking", { message: "正在思考" }, 1))
  renderer.event(event("assistant.reasoning", { content: "先读取配置" }, 2))
  renderer.event(event("assistant.reasoning", { content: "再修改文件" }, 3))
  renderer.event(event("assistant.text", { content: "我先看下实现。" }, 4))
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 5))
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: true, output: "86 行" }, 6))
  renderer.event(event("run.settled", { result: "completed" }, 7))
  const out = io.plain()
  expect(out).toContain("✓ 思考过程 · 10 字")
  expect(out).toContain("Agent")
  expect(out).toContain("我先看下实现。")
  expect(out).toContain("✓ 工具结果 read")
  expect(out).toContain("✓ 运行完成")
  expect(renderer.status()).toBe("completed")
})

test("renderer marks failed tool results and failed runs", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "bash" }, 1))
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "bash", ok: false, output: "exit 1" }, 2))
  renderer.event(event("run.settled", { result: "failed" }, 3))
  const out = io.plain()
  expect(out).toContain("✗ 工具结果 bash")
  expect(out).toContain("✗ 运行失败")
  expect(renderer.status()).toBe("failed")
})

test("full thinking mode streams reasoning text and /expand reprints it", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io, thinking: "full" })
  renderer.event(event("assistant.reasoning", { content: "完整推理过程" }, 1))
  expect(io.plain()).toContain("完整推理过程")
  renderer.event(event("assistant.text", { content: "回答" }, 2))
  renderer.expandLastReasoning()
  const occurrences = io.plain().split("完整推理过程").length - 1
  expect(occurrences).toBe(2)
})

test("status tracks permission, question and retry events", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 1))
  expect(renderer.status()).toBe("awaiting permission")
  renderer.event(event("question.request", { requestID: "q1", questions: [] }, 2))
  expect(renderer.status()).toBe("awaiting question")
  renderer.event(event("model.retry", { attempt: 1, maxRetries: 3, delayMs: 800, willRetry: true }, 3))
  expect(renderer.status()).toBe("retrying")
  renderer.event(event("run.settled", { result: "cancelled" }, 4))
  expect(renderer.status()).toBe("cancelled")
})

test("thinking live never overwrites an active tool live line", async () => {
  const io = memoryIO({ anim: true })
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 1))
  renderer.event(event("assistant.reasoning", { content: "工具运行期间的推理" }, 2))
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: true, output: "完成" }, 3))
  renderer.close()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const out = io.plain()
  expect(out).toContain("✓ 工具结果 read")
  expect(out.split("✓ 工具结果 read · 完成\n")[1]).toBe("")
})

test("permission pauses the active tool line and tool.result still prints after the pause", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 1))
  renderer.event(event("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 2))
  // 工具行冻结为静态等待行,独占一行(后续输出不粘接)
  expect(io.plain()).toContain("⏸ 工具调用 read · 等待权限确认\n")
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: true, output: "完成" }, 3))
  const out = io.plain()
  expect(out).toContain("✓ 工具结果 read · 完成\n")
  expect(out.indexOf("等待权限确认")).toBeLessThan(out.indexOf("✓ 工具结果 read"))
  renderer.close()
})

test("question pauses the active tool line as 等待回答", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 1))
  renderer.event(
    event("question.request", { requestID: "q1", toolCallID: "tool_1", questions: [{ header: "h", question: "q?", options: [{ label: "A", description: "" }] }] }, 2),
  )
  expect(io.plain()).toContain("⏸ 工具调用 read · 等待回答\n")
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: true, output: "完成" }, 3))
  expect(io.plain()).toContain("✓ 工具结果 read")
  renderer.close()
})

test("paused tool line freezes while awaiting and resumeTool restarts it until tool.result", async () => {
  const io = memoryIO({ anim: true })
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 1))
  renderer.event(event("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 2))
  const frozen = io.output()
  await new Promise((resolve) => setTimeout(resolve, 200))
  // 等待期间不再计时重绘
  expect(io.output()).toBe(frozen)
  expect(io.plain()).toContain("⏸ 工具调用 read · 等待权限确认")
  renderer.resumeTool()
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(io.plain()).toContain("执行中")
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: true, output: "完成" }, 3))
  renderer.close()
  const out = io.plain()
  expect(out.indexOf("等待权限确认")).toBeLessThan(out.indexOf("执行中"))
  expect(out.indexOf("执行中")).toBeLessThan(out.indexOf("✓ 工具结果 read"))
})

test("resumeTool is a no-op when no tool is paused", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.resumeTool()
  expect(io.plain()).toBe("")
  renderer.close()
})

test("paused tool without resume still prints a failed tool result", () => {
  const io = memoryIO()
  const renderer = createRenderer({ io })
  renderer.event(event("tool.request", { toolCallID: "tool_1", toolName: "read" }, 1))
  renderer.event(event("permission.requested", { requestID: "p1", action: "edit", resource: "a.ts" }, 2))
  renderer.event(event("tool.result", { toolCallID: "tool_1", toolName: "read", ok: false, output: "拒绝" }, 3))
  const out = io.plain()
  expect(out).toContain("✗ 工具结果 read")
  expect(out.indexOf("等待权限确认")).toBeLessThan(out.indexOf("✗ 工具结果 read"))
  renderer.close()
})

test("thinking live tail collapses newlines so frames never span multiple lines", async () => {
  const io = memoryIO({ anim: true })
  const renderer = createRenderer({ io, thinking: "summary" })
  renderer.event(event("assistant.thinking", { message: "正在思考" }, 1))
  renderer.event(event("assistant.reasoning", { content: "第一行\n第二行\n第三行" }, 2))
  await new Promise((resolve) => setTimeout(resolve, 100))
  // 只取动画帧(close 的 settle 行本身以 \n 结尾,不属于帧)
  const frames = io.output().split("\r\x1b[2K").filter(Boolean)
  renderer.close()
  expect(frames.length).toBeGreaterThan(0)
  // tail 折叠空白后帧内容恒为单行,\r\x1b[2K 才能整行擦除
  for (const frame of frames) expect(frame).not.toContain("\n")
  expect(io.plain()).toContain("第一行 第二行 第三行")
})

test("assistant text renders markdown with ansi16 caps and hides raw markers", () => {
  const io = memoryIO({ color: "ansi16" })
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.text", { content: "我是 **Nexum**\n" }, 1))
  const out = io.output()
  expect(out).toContain("\x1b[1mNexum\x1b[0m")
  expect(out).not.toContain("**")
})

test("pending markdown line flushes before tool lines without interleaving", () => {
  const io = memoryIO({ color: "ansi16" })
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.text", { content: "半行 **加粗** 收尾" }, 1))
  renderer.event(event("tool.request", { toolCallID: "t1", toolName: "read" }, 2))
  renderer.event(event("tool.result", { toolCallID: "t1", toolName: "read", ok: true, output: "完成" }, 3))
  const out = io.output()
  const renderedAt = out.indexOf("半行 \x1b[1m加粗\x1b[0m 收尾\n")
  expect(renderedAt).toBeGreaterThan(-1)
  expect(renderedAt).toBeLessThan(out.indexOf("工具结果"))
  expect(out.indexOf("半行 **加粗** 收尾")).toBeLessThan(out.indexOf("\r\x1b[2K"))
  expect(out.indexOf("\r\x1b[2K")).toBeLessThan(renderedAt)
})

test("historyLines renders assistant markdown content", () => {
  const caps = { isTTY: true, color: "ansi16", anim: false, theme: "dark" } as const
  const lines = historyLines(caps, [
    { index: 1, message: { role: "assistant", content: "已修复 **超时** 问题" } },
  ])
  const text = lines.join("\n")
  expect(text).toContain("\x1b[1m超时\x1b[0m")
  expect(text).not.toContain("**")
})

test("historyLines compacts canonical history", () => {
  const io = memoryIO()
  const lines = historyLines(io.caps, [
    { index: 1, message: { role: "user", content: "修复超时" } },
    { index: 2, message: { role: "assistant", reasoningContent: "想一下", content: "已修复", toolCalls: [{ id: "t1", name: "edit", input: {} }] } },
    { index: 3, message: { role: "tool", toolCallID: "t1", content: "ok" } },
  ])
  const text = lines.join("\n")
  expect(text).toContain("你")
  expect(text).toContain("修复超时")
  expect(text).toContain("Agent")
  expect(text).toContain("已修复")
  expect(text).toContain("edit")
})

/** 极简终端模拟:解释 \r、\n、EL(0K/2K)、ED(0J)、CUU(nA)、CUB(nD),忽略 SGR,重建最终屏幕行。 */
function emulateScreen(output: string): string[] {
  const rows: string[] = [""]
  let row = 0
  let col = 0
  const put = (ch: string) => {
    const line = rows[row] ?? ""
    rows[row] = col < line.length ? line.slice(0, col) + ch + line.slice(col + 1) : line + " ".repeat(col - line.length) + ch
    col += 1
  }
  for (const token of output.match(/\x1b\[[0-9;]*[A-Za-z]|\r|\n|./gsu) ?? []) {
    if (token === "\r") {
      col = 0
      continue
    }
    if (token === "\n") {
      row += 1
      col = 0
      if (rows.length <= row) rows.push("")
      continue
    }
    if (token.startsWith("\x1b")) {
      const match = token.match(/\x1b\[([0-9;]*)([A-Za-z])/)!
      const param = Number.parseInt(match[1] || "0", 10)
      const command = match[2]
      if (command === "K") rows[row] = param === 2 ? "" : (rows[row] ?? "").slice(0, col)
      if (command === "J") {
        rows.length = row + 1
        rows[row] = (rows[row] ?? "").slice(0, col)
      }
      if (command === "A") row = Math.max(0, row - Math.max(1, param))
      if (command === "D") col = Math.max(0, col - Math.max(1, param))
      continue
    }
    put(token)
  }
  return rows
}

test("live mode (default) streams dim reasoning lines above the spinner and collapses to the summary", async () => {
  const io = memoryIO({ color: "ansi16", anim: true })
  const renderer = createRenderer({ io })
  expect(renderer.thinkingMode()).toBe("live")
  renderer.event(event("assistant.thinking", { message: "正在思考" }, 1))
  renderer.event(event("assistant.reasoning", { content: "第一行\n第" }, 2))
  renderer.event(event("assistant.reasoning", { content: "二行\n尾巴" }, 3))
  await new Promise((resolve) => setTimeout(resolve, 100))
  const during = io.output()
  expect(during).toContain("\x1b[2m  第一行\x1b[0m\n")
  expect(during).toContain("\x1b[2m  第二行\x1b[0m\n")
  // 半行留在缓冲,不进流式区
  expect(during).not.toContain("尾巴\n")
  // 插入行之后活动行仍在重绘(spinner 帧出现在流式行之后)
  expect(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(during.slice(during.indexOf("  第一行")))).toBe(true)
  renderer.event(event("assistant.text", { content: "回答" }, 4))
  renderer.event(event("run.settled", { result: "completed" }, 5))
  renderer.close()
  const out = io.output()
  // 两行流式区 + 活动行,收起时上移两行清到屏尾
  expect(out).toContain("\x1b[2A\x1b[0J")
  const screen = emulateScreen(out).join("\n")
  expect(screen).toContain("✓ 思考过程 · 10 字")
  expect(screen).toContain("回答")
  expect(screen).not.toContain("第一行")
  expect(screen).not.toContain("第二行")
  expect(screen).not.toContain("尾巴")
})

test("live mode with no complete line collapses to the summary without stray streamed output", () => {
  const io = memoryIO({ color: "none", anim: true })
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.reasoning", { content: "没有换行的短思考" }, 1))
  renderer.event(event("assistant.text", { content: "回答" }, 2))
  renderer.close()
  // writeAbove 以"内容+\n"形式出现;spinner 帧内只含 tail 不含换行
  expect(io.output()).not.toContain("没有换行的短思考\n")
  expect(io.plain()).toContain("✓ 思考过程 · 8 字")
  renderer.expandLastReasoning()
  expect(io.plain()).toContain("没有换行的短思考")
})

test("live mode discards the partial reasoning tail on collapse but /expand keeps the full text", () => {
  const io = memoryIO({ color: "none", anim: true })
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.reasoning", { content: "完整行\n未完成尾" }, 1))
  renderer.event(event("assistant.text", { content: "回答" }, 2))
  renderer.close()
  const screen = emulateScreen(io.output()).join("\n")
  expect(screen).not.toContain("完整行")
  expect(screen).not.toContain("未完成尾")
  expect(screen).toContain("✓ 思考过程")
  renderer.expandLastReasoning()
  expect(io.plain()).toContain("完整行\n未完成尾")
})

test("static terminal degrades live mode to summary behavior", () => {
  const io = memoryIO({ anim: false })
  const renderer = createRenderer({ io })
  renderer.event(event("assistant.thinking", { message: "正在思考" }, 1))
  renderer.event(event("assistant.reasoning", { content: "第一行\n第二行\n" }, 2))
  renderer.event(event("assistant.text", { content: "回答" }, 3))
  renderer.close()
  const out = io.plain()
  expect(out).toContain("✓ 思考过程 · 8 字")
  expect(out).not.toContain("第一行")
  expect(out).not.toContain("\x1b[")
})

test("summary mode keeps a single live line and settles without erasing streamed rows", async () => {
  const io = memoryIO({ color: "none", anim: true })
  const renderer = createRenderer({ io, thinking: "summary" })
  renderer.event(event("assistant.reasoning", { content: "第一行\n第二行\n" }, 1))
  await new Promise((resolve) => setTimeout(resolve, 100))
  renderer.event(event("assistant.text", { content: "回答" }, 2))
  renderer.close()
  expect(io.output()).not.toContain("\x1b[0J")
  expect(io.output()).not.toContain("第一行\n")
  expect(io.plain()).toContain("✓ 思考过程 · 8 字")
})
