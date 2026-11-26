import { expect, test } from "bun:test"
import type { NexumEvent } from "../src/index.ts"
import { composeChatPrompt, historyItemsFromMessages, mergeHistoryItems, mergePendingChatItems, projectChatEvent } from "../src/chat-surface.tsx"
import type { ChatItem } from "../src/chat-surface.tsx"
import type { ChatStateSnapshot } from "../src/index.ts"

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

test("ChatSurface keeps the question visible and summarizes the uploaded file in history", () => {
  const items = historyItemsFromMessages([
    { index: 1, message: { role: "user", content: composeChatPrompt("请总结重点", { name: "README.md", text: "# 标题\n长文件正文" }) } },
  ])

  expect(items[0]).toMatchObject({ kind: "user", content: "请总结重点", attachmentName: "README.md" })
})

test("ChatSurface can replay the previous file-context format", () => {
  const items = historyItemsFromMessages([
    { index: 1, message: { role: "user", content: "请总结重点\n\n【文件：README.md】\n# 标题\n正文\n【文件结束】" } },
  ])

  expect(items[0]).toMatchObject({ kind: "user", content: "请总结重点", attachmentName: "README.md" })
})

test("ChatSurface merges pending state without removing an existing user message", () => {
  const current = [{ id: "user:001", kind: "user", title: "你", content: "刚发送的问题", status: "completed", localTime: "当前" }] satisfies ChatItem[]
  const state = {
    session: { id: "session_001", name: "测试", directory: "/tmp/nexum", status: "idle", createdAt: "2026-11-26T00:00:00.000Z", updatedAt: "2026-11-26T00:00:00.000Z" },
    canContinue: false,
    canCancel: false,
    pendingPermissions: [{ id: "permission_001", sessionID: "session_001", action: "read", resource: "README.md" }],
    pendingQuestions: [],
    lastSequence: 0,
  } satisfies ChatStateSnapshot

  expect(mergePendingChatItems(current, state)).toMatchObject([
    { id: "user:001", content: "刚发送的问题" },
    { id: "permission:permission_001", status: "waiting" },
  ])
})

test("ChatSurface reconciles the optimistic user message with history without duplicating it", () => {
  const prompt = composeChatPrompt("能告诉我文件内容吗", { name: "notes.md", text: "正文" })
  const current = [
    { id: "user:optimistic", kind: "user", title: "你", content: "能告诉我文件内容吗", attachmentName: "notes.md", sourceContent: prompt, status: "completed", localTime: "当前" },
    { id: "thinking:session_001", kind: "status", title: "Agent 思考", content: "模型正在思考", status: "streaming", localTime: "当前" },
  ] satisfies ChatItem[]
  const incoming = historyItemsFromMessages([{ index: 0, message: { role: "user", content: prompt } }])

  const merged = mergeHistoryItems(current, incoming)

  expect(merged).toHaveLength(2)
  expect(merged.filter((item) => item.kind === "user")).toHaveLength(1)
  expect(merged[0]).toMatchObject({ id: "user:optimistic", content: "能告诉我文件内容吗", attachmentName: "notes.md" })
})

test("ChatSurface does not drop an older identical question while prepending history", () => {
  const current = [{ id: "history:user:2", kind: "user", title: "你", content: "重复问题", sourceContent: "重复问题", status: "completed", localTime: "历史" }] satisfies ChatItem[]
  const incoming = historyItemsFromMessages([{ index: 1, message: { role: "user", content: "重复问题" } }])

  expect(mergeHistoryItems(current, incoming).map((item) => item.id)).toEqual(["history:user:1", "history:user:2"])
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

test("ChatSurface settles streamed items when a run completes", () => {
  const attempted = projectChatEvent([], event("model.attempt", { attempt: 1, maxRetries: 0 }, 1))
  const streamed = projectChatEvent(attempted, event("assistant.text", { content: "完成" }, 2))
  const settled = projectChatEvent(streamed, event("run.settled", { result: "completed" }, 3))

  expect(settled.find((item) => item.id === "model.attempt:run_001")?.status).toBe("completed")
  expect(settled.find((item) => item.kind === "assistant")?.status).toBe("completed")
  expect(settled.some((item) => item.status === "running" || item.status === "streaming")).toBe(false)
})

test.each([
  ["failed", "failed"],
  ["cancelled", "cancelled"],
] as const)("ChatSurface settles streamed items when a run is %s", (result, expectedStatus) => {
  const attempted = projectChatEvent([], event("model.attempt", { attempt: 1, maxRetries: 0 }, 1))
  const streamed = projectChatEvent(attempted, event("assistant.text", { content: "中断前输出" }, 2))
  const settled = projectChatEvent(streamed, event("run.settled", { result }, 3))

  expect(settled.find((item) => item.id === "model.attempt:run_001")?.status).toBe(expectedStatus)
  expect(settled.find((item) => item.kind === "assistant")?.status).toBe(expectedStatus)
})

test("ChatSurface keeps a running tool above later thinking heartbeats", () => {
  const tool = projectChatEvent([], event("tool.request", { toolCallID: "tool_001", toolName: "shell" }, 1))
  const heartbeat = projectChatEvent(tool, event("assistant.thinking", { message: "模型正在思考" }, 2))

  expect(heartbeat.find((item) => item.id === "tool:tool_001")?.status).toBe("running")
  expect(heartbeat.some((item) => item.thinking)).toBe(false)
})

test("ChatSurface keeps the thinking status until reasoning content arrives", () => {
  const thinking = projectChatEvent([], event("assistant.thinking", { message: "模型正在思考" }, 1))
  const emptyReasoning = projectChatEvent(thinking, event("assistant.reasoning", {}, 2))

  expect(emptyReasoning).toEqual(thinking)
  expect(emptyReasoning.find((item) => item.thinking)?.thinkingStatus).toContain("若模型提供思考内容")
})

test("ChatSurface projects a tool timeout with a recovery-oriented message", () => {
  const tool = projectChatEvent([], event("tool.request", { toolCallID: "tool_002", toolName: "shell" }, 1))
  const timedOut = projectChatEvent(tool, event("tool.result", {
    toolCallID: "tool_002",
    toolName: "shell",
    ok: false,
    errorCode: "timeout",
    status: "timeout",
    output: "工具执行超时",
  }, 2))

  expect(timedOut.find((item) => item.id === "tool:tool_002")).toMatchObject({
    status: "failed",
    content: "工具执行超时，可继续运行",
  })
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
