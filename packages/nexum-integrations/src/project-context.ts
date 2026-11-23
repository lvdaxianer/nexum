/** 本地文件系统提供的项目上下文来源。 */

import type { ProjectContextEntry, ProjectContextPort, ProjectContextSource } from "@nexum/core"
import { readFile as readFileFromDisk } from "node:fs/promises"

/** 本地项目上下文端口的配置。 */
export interface NexumFileProjectContextOptions {
  readonly sources: readonly ProjectContextSource[]
  readonly readFile?: (path: string) => Promise<string | undefined>
}

/** 创建通过本地文件读取项目上下文的端口。 */
export function createNexumProjectContextPort(options: NexumFileProjectContextOptions): ProjectContextPort {
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
