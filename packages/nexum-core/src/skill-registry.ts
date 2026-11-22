/** Nexum Core 的 Skill Registry 端口。 */

export type NexumSkillStatus = "ready" | "invalid" | "conflict"

export interface NexumSkillSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version?: string
  readonly digest: string
  readonly fileCount: number
  readonly files: readonly string[]
  readonly status: NexumSkillStatus
  readonly diagnostics: readonly string[]
}

export interface NexumSkillPackage extends NexumSkillSummary {
  readonly read: (relativePath: string) => Promise<string>
}

export interface NexumSkillRegistryOptions {
  readonly roots: readonly string[]
  readonly maxFileBytes?: number
}

export interface NexumSkillRegistry {
  readonly refresh: () => Promise<void>
  readonly list: () => Promise<readonly NexumSkillSummary[]>
  readonly get: (id: string) => Promise<NexumSkillPackage | undefined>
}
