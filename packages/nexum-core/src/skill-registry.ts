/** Nexum Core 的 Skill Registry 端口。 */

export type NexumSkillStatus = "ready" | "invalid" | "conflict"

export type NexumSkillSourceType = "local-directory"

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
  readonly sourceType?: NexumSkillSourceType
  readonly registeredAt?: string
  readonly updatedAt?: string
}

export interface NexumSkillPackage extends NexumSkillSummary {
  readonly read: (relativePath: string) => Promise<string>
}

export interface NexumSkillRegistryOptions {
  readonly roots: readonly string[]
  readonly maxFileBytes?: number
  readonly filePath?: string
}

export interface NexumSkillRegistry {
  readonly register: (address: string) => Promise<NexumSkillSummary>
  readonly refresh: (id?: string) => Promise<void>
  readonly list: () => Promise<readonly NexumSkillSummary[]>
  readonly get: (id: string) => Promise<NexumSkillPackage | undefined>
  readonly unregister: (id: string) => Promise<void>
}
