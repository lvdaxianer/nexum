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
