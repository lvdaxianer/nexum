import { expect, test } from "bun:test"
import type {
  ContextCompactionPort,
  ContextCompactionResult,
  ProjectContextEntry,
  QuestionPort,
} from "../src/context.ts"
import type { ModelMessage, ToolResult } from "../src/index.ts"

test("exposes UI-independent context and question contracts", async () => {
  const messages: readonly ModelMessage[] = [
    { role: "system", content: "项目约束", sourceID: "instruction:project" },
    { role: "user", content: "请完成任务" },
  ]
  const projectContext: readonly ProjectContextEntry[] = [
    { sourceID: "instruction:project", kind: "instruction", path: "AGENTS.md", content: "项目约束" },
  ]
  const compacted: ContextCompactionResult = {
    summary: "任务摘要",
    recentMessages: messages.slice(-1),
    context: projectContext,
  }
  const compaction: ContextCompactionPort = {
    estimate: () => 1,
    compact: async () => compacted,
  }
  const questions: QuestionPort = {
    async list() {
      return []
    },
    async reply() {
      const result: ToolResult = { ok: true, output: "" }
      return result
    },
    async cancel() {},
  }

  expect(compaction).toHaveProperty("estimate")
  expect(compaction).toHaveProperty("compact")
  expect(questions).toHaveProperty("list")
  expect(compacted.summary).toBe("任务摘要")
})
