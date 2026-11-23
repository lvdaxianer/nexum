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

function event(type: NexumEvent["type"], data: Record<string, unknown>, sequence: number): NexumEvent {
  return {
    eventID: `event_${sequence}`,
    runID: "run_001",
    type,
    sessionID: "session_001",
    sequence,
    occurredAt: "2026-11-24T00:00:00.000Z",
    data,
  }
}
