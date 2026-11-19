/** Headless Core 的上下文、压缩和用户补充信息端口。 */

import type { ModelMessage, ToolResult } from "./index.js"

/** 一条可注入模型上下文的项目来源。 */
export interface ProjectContextEntry {
  readonly sourceID: string
  readonly kind: "instruction" | "skill" | "reference"
  readonly path: string
  readonly content: string
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
  readonly questions: readonly {
    readonly header: string
    readonly question: string
    readonly options: readonly { readonly label: string; readonly description: string }[]
    readonly multiple?: boolean
  }[]
}

/** Question 交互端口。 */
export interface QuestionPort {
  readonly list: (sessionID: string) => Promise<readonly HeadlessQuestionRequest[]>
  readonly reply: (sessionID: string, requestID: string, answers: readonly (readonly string[])[]) => Promise<ToolResult>
  readonly cancel: (sessionID: string, requestID: string) => Promise<void>
}
