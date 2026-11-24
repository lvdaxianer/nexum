import { expect, test } from "bun:test"
import type { NexumEvent } from "@nexum/client"
import { historyItemsFromMessages, projectChatEvent } from "../src/chat-surface.tsx"

test("ChatSurface projects canonical history into user, assistant, reasoning and tool items", () => {
  const items = historyItemsFromMessages([
    { index: 1, message: { role: "user", content: "请检查项目" } },
    {
      index: 2,
      message: {
        role: "assistant",
        reasoningContent: "先读取项目状态",
        content: "我开始检查。",
        toolCalls: [{ id: "tool_001", name: "shell", input: { command: "pwd" } }],
      },
    },
    { index: 3, message: { role: "tool", toolCallID: "tool_001", content: " /workspace/project " } },
  ])

  expect(items.map((item) => [item.kind, item.content])).toEqual([
    ["user", "请检查项目"],
    ["reasoning", "先读取项目状态"],
    ["assistant", "我开始检查。"],
    ["execution", "历史工具调用"],
    ["execution", "/workspace/project"],
  ])
})

test("ChatSurface merges streaming assistant text and renders permission/question events", () => {
  const first = projectChatEvent([], event("assistant.text", { content: "你好" }, 1))
  const second = projectChatEvent(first, event("assistant.text", { content: "，世界" }, 2))
  const withPermission = projectChatEvent(
    second,
    event("permission.requested", { requestID: "permission_001", action: "shell", resource: "pwd", reason: "需要检查目录" }, 3),
  )
  const withQuestion = projectChatEvent(
    withPermission,
    event("question.request", {
      requestID: "question_001",
      questions: [{ header: "确认", question: "继续吗？", options: [{ label: "是", description: "继续" }] }],
    }, 4),
  )

  expect(second.find((item) => item.kind === "assistant")?.content).toBe("你好，世界")
  expect(withPermission.find((item) => item.id === "permission:permission_001")?.status).toBe("waiting")
  expect(withQuestion.find((item) => item.id === "question:question_001")?.status).toBe("waiting")
})

test("ChatSurface records reasoning timing across the streaming lifecycle", () => {
  const started = projectChatEvent([], event("assistant.reasoning", { content: "先想" }, 1, "2026-11-24T00:00:00.000Z"))
  const appended = projectChatEvent(started, event("assistant.reasoning", { content: "，再做" }, 2, "2026-11-24T00:00:05.000Z"))
  const closed = projectChatEvent(appended, event("assistant.text", { content: "结果" }, 3, "2026-11-24T00:00:12.000Z"))

  const reasoning = closed.find((item) => item.kind === "reasoning")
  expect(reasoning?.content).toBe("先想，再做")
  expect(reasoning?.status).toBe("completed")
  expect(reasoning?.startedAt).toBe("2026-11-24T00:00:00.000Z")
  expect(reasoning?.elapsedMs).toBe(12_000)
})

function event(type: NexumEvent["type"], data: Record<string, unknown>, sequence: number, occurredAt = "2026-11-24T00:00:00.000Z"): NexumEvent {
  return {
    eventID: `event_${sequence}`,
    runID: "run_001",
    type,
    sessionID: "session_001",
    sequence,
    occurredAt,
    data,
  }
}
