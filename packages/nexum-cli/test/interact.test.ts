import { expect, test } from "bun:test"
import type { NexumPermission, NexumQuestion } from "@nexum/client"
import { askPermission, askQuestion, permissionFromEvent, questionFromEvent } from "../src/interact.ts"
import { memoryIO } from "../src/io.ts"

const permission: NexumPermission = { id: "p1", sessionID: "s1", action: "edit", resource: "src/a.ts", reason: "修改文件" }

const question: NexumQuestion = {
  id: "q1",
  sessionID: "s1",
  toolCallID: "t1",
  questions: [
    { header: "次数", question: "重试次数?", options: [{ label: "3 次", description: "推荐" }, { label: "5 次", description: "" }] },
    { header: "策略", question: "间隔策略?", multiple: true, options: [{ label: "固定", description: "" }, { label: "指数退避", description: "推荐" }] },
  ],
}

test("askPermission maps 1/2/3 to decisions and reasks on invalid input", async () => {
  const io = memoryIO()
  const answers = ["x", "2"]
  const decision = await askPermission(io, async () => answers.shift()!, permission)
  expect(decision).toBe("allow_always")
  expect(io.plain()).toContain("需要权限确认")
  expect(io.plain()).toContain("edit · src/a.ts")
})

test("askQuestion collects answers in question order and validates picks", async () => {
  const io = memoryIO()
  const answers = ["9", "1", "1,2"]
  const result = await askQuestion(io, async () => answers.shift()!, question)
  expect(result).toEqual([["3 次"], ["固定", "指数退避"]])
  expect(io.plain()).toContain("重试次数?")
  expect(io.plain()).toContain("无效选择")
})

test("askQuestion returns cancel on c", async () => {
  const io = memoryIO()
  const result = await askQuestion(io, async () => "c", question)
  expect(result).toBe("cancel")
})

test("event parsers build requests from event data", () => {
  expect(permissionFromEvent({ requestID: "p9", action: "bash", resource: "rm" }, "s1")).toEqual({ id: "p9", sessionID: "s1", action: "bash", resource: "rm" })
  const parsed = questionFromEvent({ requestID: "q9", toolCallID: "t9", questions: question.questions }, "s1")
  expect(parsed?.id).toBe("q9")
  expect(parsed?.questions.length).toBe(2)
  expect(permissionFromEvent({ requestID: "p9" }, "s1")).toBeUndefined()
})
