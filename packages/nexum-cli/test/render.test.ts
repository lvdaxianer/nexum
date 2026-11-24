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
