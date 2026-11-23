/** Nexum 应用层的 Question Broker 编排。 */

import {
  NexumQuestionError,
  type NexumInteractionStore,
  type NexumQuestionPort,
  type NexumQuestionRequest,
  type ToolResult,
} from "@nexum/core"

/** Question Broker 的可选持久化依赖。 */
export interface NexumQuestionPortOptions {
  readonly interactionStore?: NexumInteractionStore
}

/** 创建可被 UI 查询、回答和取消的内存 Question Broker。 */
export function createNexumQuestionPort(options: NexumQuestionPortOptions = {}): NexumQuestionPort {
  const pending = new Map<string, PendingQuestion>()
  const resolved = new Map<string, { sessionID: string; result: ToolResult }>()

  return {
    async ask(request) {
      if (pending.has(request.id) || resolved.has(request.id)) {
        throw new NexumQuestionError("not_found", "Question ID 已被使用")
      }
      const resultPromise = new Promise<ToolResult>((resolve) => pending.set(request.id, { request, resolve }))
      try {
        await options.interactionStore?.save({
          requestID: request.id,
          sessionID: request.sessionID,
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          kind: "question",
          toolCallID: request.toolCallID,
          questions: request.questions,
        })
      } catch (error) {
        pending.delete(request.id)
        throw error
      }
      const result = await resultPromise
      pending.delete(request.id)
      await options.interactionStore?.delete(request.id)
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
      throw new NexumQuestionError("not_found", "Question 不存在")
    },
    async cancel(sessionID, requestID) {
      const active = pending.get(requestID)
      if (!active) throw new NexumQuestionError("not_found", "Question 不存在")
      assertQuestionSession(active.request, sessionID)
      const result = { ok: false, output: "问题已取消" }
      active.settled = result
      pending.delete(requestID)
      void options.interactionStore?.delete(requestID)
      active.resolve(result)
    },
  }
}

interface PendingQuestion {
  readonly request: NexumQuestionRequest
  readonly resolve: (result: ToolResult) => void
  settled?: ToolResult
}

function createQuestionResult(requestID: string, answers: readonly (readonly string[])[]): ToolResult {
  return { ok: true, output: JSON.stringify({ requestID, answers }) }
}

function validateQuestionAnswers(request: NexumQuestionRequest, answers: readonly (readonly string[])[]): void {
  if (answers.length !== request.questions.length) {
    throw new NexumQuestionError("invalid_answers", "Question 回答数量不匹配")
  }
  request.questions.forEach((question, index) => {
    const answer = answers[index] ?? []
    if (!question.multiple && answer.length > 1) {
      throw new NexumQuestionError("invalid_answers", "单选 Question 不能提交多个答案")
    }
    if (
      question.options.length > 0 &&
      answer.some((value) => !question.options.some((option) => option.label === value))
    ) {
      throw new NexumQuestionError("invalid_answers", "Question 包含无效选项")
    }
  })
}

function assertQuestionSession(request: { readonly sessionID: string }, sessionID: string): void {
  if (request.sessionID !== sessionID) {
    throw new NexumQuestionError("session_mismatch", "Question 不属于当前 Session")
  }
}
