import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createNexumCodingLoop,
  createNexumSessionService,
  type EventSink,
  type ModelPort,
  type PermissionPort,
  type ToolPort,
} from "../src/index.ts"
import { createFileInteractionStore, createNexumQuestionPort } from "../../nexum-adapters/src/index.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("keeps a structured question pending and preserves ordered answers", async () => {
  const questions = createNexumQuestionPort()
  const pending = questions.ask({
    id: "question_001",
    sessionID: "session_001",
    toolCallID: "call_question_001",
    questions: [
      {
        header: "语言",
        question: "选择语言",
        options: [{ label: "TypeScript", description: "使用 TypeScript" }],
      },
      {
        header: "测试",
        question: "是否补测试",
        options: [{ label: "是", description: "补充测试" }],
      },
    ],
  })

  await expect(questions.list("session_001")).resolves.toHaveLength(1)
  await expect(questions.reply("other_session", "question_001", [["TypeScript"], ["是"]])).rejects.toMatchObject({
    code: "session_mismatch",
  })
  await expect(questions.reply("session_001", "question_001", [["Unknown"], ["是"]])).rejects.toMatchObject({
    code: "invalid_answers",
  })
  await expect(questions.reply("session_001", "question_001", [["TypeScript"], ["是"]])).resolves.toEqual({
    ok: true,
    output: JSON.stringify({ requestID: "question_001", answers: [["TypeScript"], ["是"]] }),
  })
  await expect(pending).resolves.toEqual({
    ok: true,
    output: JSON.stringify({ requestID: "question_001", answers: [["TypeScript"], ["是"]] }),
  })
  await expect(questions.list("session_001")).resolves.toEqual([])
  await expect(questions.reply("session_001", "question_001", [["TypeScript"], ["是"]])).resolves.toEqual({
    ok: true,
    output: JSON.stringify({ requestID: "question_001", answers: [["TypeScript"], ["是"]] }),
  })
})

test("resumes the model with question answers and never executes a tool before an answer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-question-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const questions = createNexumQuestionPort()
  const prompts: Array<Parameters<ModelPort["prompt"]>[0]> = []
  const events: string[] = []
  let step = 0
  const model: ModelPort = {
    async *prompt(input) {
      prompts.push(input)
      step += 1
      if (step === 1) {
        yield {
          type: "tool-call",
          toolCallID: "call_question_001",
          toolName: "question",
          toolInput: {
            questions: [
              {
                header: "目录",
                question: "选择目录",
                options: [{ label: "src", description: "源代码目录" }],
              },
            ],
          },
        }
        return
      }
      yield { type: "completed" }
    },
  }
  const toolCalls: string[] = []
  const tool: ToolPort = {
    async execute(request) {
      toolCalls.push(request.toolName)
      return { ok: true, output: "不应执行" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event.type)
    },
  }
  const run = createNexumCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events: eventSink,
    question: questions,
  }).run({
    sessionID: session.sessionID,
    text: "开始任务",
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  await expect(questions.list(session.sessionID)).resolves.toHaveLength(1)
  await questions.reply(session.sessionID, "call_question_001", [["src"]])
  await expect(run).resolves.toMatchObject({ status: "completed" })
  expect(toolCalls).toEqual([])
  expect(events).toEqual(["model.attempt", "question.request", "question.result", "model.attempt", "session.completed", "run.settled"])
  expect(prompts[1]?.messages).toEqual([
    { role: "user", content: "开始任务" },
    {
      role: "assistant",
      toolCalls: [
        {
          id: "call_question_001",
          name: "question",
          input: {
            questions: [
              { header: "目录", question: "选择目录", options: [{ label: "src", description: "源代码目录" }] },
            ],
          },
        },
      ],
    },
    {
      role: "tool",
      toolCallID: "call_question_001",
      content: JSON.stringify({ requestID: "call_question_001", answers: [["src"]] }),
    },
  ])
})

test("cancelling a pending question fails the run without executing a tool", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-question-cancel-"))
  temporaryDirectories.push(directory)
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory })
  const questions = createNexumQuestionPort()
  const events: string[] = []
  const model: ModelPort = {
    async *prompt() {
      yield {
        type: "question",
        questionID: "question_002",
        toolCallID: "call_question_002",
        questions: [{ header: "确认", question: "继续吗", options: [{ label: "是", description: "继续" }] }],
      }
    },
  }
  let executed = false
  const tool: ToolPort = {
    async execute() {
      executed = true
      return { ok: true, output: "错误" }
    },
  }
  const permission: PermissionPort = {
    async evaluate() {
      return "allow"
    },
  }
  const eventSink: EventSink = {
    async publish(event) {
      events.push(event.type)
    },
  }
  const run = createNexumCodingLoop({
    model,
    tool,
    permission,
    sessions,
    events: eventSink,
    question: questions,
  }).run({
    sessionID: session.sessionID,
    text: "开始任务",
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  await questions.cancel(session.sessionID, "question_002")
  await expect(run).rejects.toThrow("问题已取消")
  expect(executed).toBe(false)
  expect(events).toEqual(["model.attempt", "question.request", "question.cancelled", "session.failed", "run.settled"])
  await expect(questions.reply(session.sessionID, "question_002", [["是"]])).rejects.toMatchObject({
    code: "not_found",
  })
})

test("persists pending Questions and recovers them as non-actionable orphaned records", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-question-recovery-"))
  temporaryDirectories.push(root)
  const filePath = join(root, "interactions.json")
  const store = createFileInteractionStore({ filePath })
  const questions = createNexumQuestionPort({ interactionStore: store })
  const pending = questions.ask({
    id: "question_recovery_001",
    sessionID: "session-recovery",
    toolCallID: "call-recovery",
    questions: [{ header: "确认", question: "继续吗", options: [{ label: "是", description: "继续" }] }],
  })

  await Bun.sleep(10)
  expect((await store.list())[0]).toMatchObject({ requestID: "question_recovery_001", status: "pending" })
  const restarted = createFileInteractionStore({ filePath })
  expect((await restarted.list())[0]).toMatchObject({ requestID: "question_recovery_001", status: "orphaned" })
  await expect(
    createNexumQuestionPort({ interactionStore: restarted }).reply("session-recovery", "question_recovery_001", [["是"]]),
  ).rejects.toMatchObject({ code: "not_found" })

  await questions.cancel("session-recovery", "question_recovery_001")
  await pending
})
