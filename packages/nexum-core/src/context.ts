/** Nexum Core 的上下文、压缩和用户补充信息端口。 */

import type { ModelMessage, ToolResult } from "./index.js"
import type { NexumInteractionStore } from "./interaction-store.js"

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

/** 项目上下文端口的依赖配置。 */
export interface NexumProjectContextPortOptions {
  readonly sources: readonly ProjectContextSource[]
  readonly readFile: (path: string) => Promise<string | undefined>
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

/** Nexum 对外展示的结构化问题。 */
export interface NexumQuestionRequest {
  readonly id: string
  readonly sessionID: string
  readonly toolCallID: string
  readonly questions: readonly NexumQuestionItem[]
}

/** Nexum 对外展示的单个结构化问题。 */
export interface NexumQuestionItem {
  readonly header: string
  readonly question: string
  readonly options: readonly { readonly label: string; readonly description: string }[]
  readonly multiple?: boolean
}

/** Question 交互端口。 */
export interface QuestionPort {
  readonly list: (sessionID: string) => Promise<readonly NexumQuestionRequest[]>
  readonly reply: (sessionID: string, requestID: string, answers: readonly (readonly string[])[]) => Promise<ToolResult>
  readonly cancel: (sessionID: string, requestID: string) => Promise<void>
}

/** 支持阻塞等待用户回答的 Question 端口。 */
export interface NexumQuestionPort extends QuestionPort {
  readonly ask: (request: NexumQuestionRequest) => Promise<ToolResult>
}

/** Question 端口的可选交互存储。 */
export interface NexumQuestionPortOptions {
  readonly interactionStore?: NexumInteractionStore
}

/** Question Broker 领域错误码。 */
export type NexumQuestionErrorCode = "invalid_answers" | "not_found" | "session_mismatch"

/** Question Broker 领域错误。 */
export class NexumQuestionError extends Error {
  constructor(
    readonly code: NexumQuestionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumQuestionError"
  }
}
