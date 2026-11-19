/** Headless Core 的上下文、压缩和用户补充信息端口。 */

import type { ModelMessage, ToolResult } from "./index.js"
import { readFile as readFileFromDisk } from "node:fs/promises"

/** 一条可注入模型上下文的项目来源。 */
export interface ProjectContextEntry {
  readonly sourceID: string
  readonly kind: "instruction" | "skill" | "reference"
  readonly path: string
  readonly content: string
}

/** 可加载的项目上下文来源描述。 */
export interface ProjectContextSource {
  readonly sourceID: string
  readonly kind: ProjectContextEntry["kind"]
  readonly path: string
}

/** 默认项目上下文端口的依赖配置。 */
export interface HeadlessProjectContextPortOptions {
  readonly sources: readonly ProjectContextSource[]
  readonly readFile?: (path: string) => Promise<string | undefined>
}

/** 创建可替换文件读取器的项目上下文端口。 */
export function createHeadlessProjectContextPort(options: HeadlessProjectContextPortOptions): ProjectContextPort {
  const sources = deduplicateProjectContextSources(options.sources)
  const readFile = options.readFile ?? readProjectContextFile
  return {
    async load(_sessionID) {
      const entries = await Promise.all(
        sources.map(async (source) => {
          const content = await readFile(source.path)
          return content === undefined ? undefined : { ...source, content }
        }),
      )
      return entries.filter((entry): entry is ProjectContextEntry => entry !== undefined)
    },
  }
}

function deduplicateProjectContextSources(sources: readonly ProjectContextSource[]): readonly ProjectContextSource[] {
  return Array.from(new Map(sources.map((source) => [source.sourceID, source])).values())
}

async function readProjectContextFile(path: string): Promise<string | undefined> {
  try {
    return await readFileFromDisk(path, "utf8")
  } catch {
    return undefined
  }
}

/** 压缩器返回的可继续生成的上下文快照。 */
export interface ContextCompactionResult {
  readonly summary: string
  readonly recentMessages: readonly ModelMessage[]
  readonly context: readonly ProjectContextEntry[]
}

/** 上下文压缩端口。 */
export interface ContextCompactionPort {
  readonly estimate: (messages: readonly ModelMessage[]) => number
  readonly compact: (input: {
    readonly messages: readonly ModelMessage[]
    readonly keepRecent: number
  }) => Promise<ContextCompactionResult>
}

/** 项目上下文加载端口。 */
export interface ProjectContextPort {
  readonly load: (sessionID: string) => Promise<readonly ProjectContextEntry[]>
}

/** Headless UI 可展示的结构化问题。 */
export interface HeadlessQuestionRequest {
  readonly id: string
  readonly sessionID: string
  readonly toolCallID: string
  readonly questions: readonly HeadlessQuestionItem[]
}

/** Headless UI 可展示的单个结构化问题。 */
export interface HeadlessQuestionItem {
  readonly header: string
  readonly question: string
  readonly options: readonly { readonly label: string; readonly description: string }[]
  readonly multiple?: boolean
}

/** Question 交互端口。 */
export interface QuestionPort {
  readonly list: (sessionID: string) => Promise<readonly HeadlessQuestionRequest[]>
  readonly reply: (sessionID: string, requestID: string, answers: readonly (readonly string[])[]) => Promise<ToolResult>
  readonly cancel: (sessionID: string, requestID: string) => Promise<void>
}

/** 支持阻塞等待用户回答的 Question 端口。 */
export interface HeadlessQuestionPort extends QuestionPort {
  readonly ask: (request: HeadlessQuestionRequest) => Promise<ToolResult>
}

/** Question Broker 领域错误码。 */
export type HeadlessQuestionErrorCode = "invalid_answers" | "not_found" | "session_mismatch"

/** Question Broker 领域错误。 */
export class HeadlessQuestionError extends Error {
  constructor(
    readonly code: HeadlessQuestionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessQuestionError"
  }
}

/** 创建可被 UI 查询、回答和取消的内存 Question Broker。 */
export function createHeadlessQuestionPort(): HeadlessQuestionPort {
  const pending = new Map<string, PendingQuestion>()
  const resolved = new Map<string, { sessionID: string; result: ToolResult }>()

  return {
    async ask(request) {
      if (pending.has(request.id) || resolved.has(request.id)) {
        throw new HeadlessQuestionError("not_found", "Question ID 已被使用")
      }
      const result = await new Promise<ToolResult>((resolve) => pending.set(request.id, { request, resolve }))
      pending.delete(request.id)
      if (result.ok) resolved.set(request.id, { sessionID: request.sessionID, result })
      return result
    },
    async list(sessionID) {
      return Array.from(pending.values())
        .filter((item) => item.request.sessionID === sessionID)
        .map((item) => ({ ...item.request }))
    },
    async reply(sessionID, requestID, answers) {
      const active = pending.get(requestID)
      if (active) {
        assertQuestionSession(active.request, sessionID)
        if (active.settled) return active.settled
        validateQuestionAnswers(active.request, answers)
        const result = createQuestionResult(requestID, answers)
        active.settled = result
        active.resolve(result)
        return result
      }
      const previous = resolved.get(requestID)
      if (previous) {
        assertQuestionSession(previous, sessionID)
        return previous.result
      }
      throw new HeadlessQuestionError("not_found", "Question 不存在")
    },
    async cancel(sessionID, requestID) {
      const active = pending.get(requestID)
      if (!active) throw new HeadlessQuestionError("not_found", "Question 不存在")
      assertQuestionSession(active.request, sessionID)
      const result = { ok: false, output: "问题已取消" }
      active.settled = result
      pending.delete(requestID)
      active.resolve(result)
    },
  }
}

interface PendingQuestion {
  readonly request: HeadlessQuestionRequest
  readonly resolve: (result: ToolResult) => void
  settled?: ToolResult
}

function createQuestionResult(requestID: string, answers: readonly (readonly string[])[]): ToolResult {
  return { ok: true, output: JSON.stringify({ requestID, answers }) }
}

function validateQuestionAnswers(request: HeadlessQuestionRequest, answers: readonly (readonly string[])[]): void {
  if (answers.length !== request.questions.length) {
    throw new HeadlessQuestionError("invalid_answers", "Question 回答数量不匹配")
  }
  request.questions.forEach((question, index) => {
    const answer = answers[index] ?? []
    if (!question.multiple && answer.length > 1) {
      throw new HeadlessQuestionError("invalid_answers", "单选 Question 不能提交多个答案")
    }
    if (
      question.options.length > 0 &&
      answer.some((value) => !question.options.some((option) => option.label === value))
    ) {
      throw new HeadlessQuestionError("invalid_answers", "Question 包含无效选项")
    }
  })
}

function assertQuestionSession(request: { readonly sessionID: string }, sessionID: string): void {
  if (request.sessionID !== sessionID) {
    throw new HeadlessQuestionError("session_mismatch", "Question 不属于当前 Session")
  }
}
