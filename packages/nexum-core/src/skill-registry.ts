/** Nexum Core 的 Skill Registry 端口。 */

export type NexumSkillStatus = "ready" | "invalid" | "conflict"

export type NexumSkillSourceType = "local-directory"

export type NexumSkillSourceKind = "builtin" | "registered"

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
  readonly sourceKind?: NexumSkillSourceKind
  readonly registeredAt?: string
  readonly updatedAt?: string
}

export interface NexumSkillPackage extends NexumSkillSummary {
  readonly read: (relativePath: string) => Promise<string>
}

/** Skill 来源扫描后交给应用层编排的候选。 */
export interface NexumSkillCandidate extends NexumSkillSummary {
  readonly address: string
  readonly read: (relativePath: string) => Promise<string>
}

/** Skill 注册记录的持久化形态。 */
export interface NexumSkillRegistration {
  readonly address: string
  readonly sourceType: NexumSkillSourceType
  readonly sourceKind?: NexumSkillSourceKind
  readonly skillID?: string
  readonly registeredAt: string
  readonly updatedAt: string
  readonly digest?: string
  readonly status?: NexumSkillStatus
  readonly diagnostics?: readonly string[]
}

/** Skill 注册状态存储端口。 */
export interface NexumSkillRegistrationStore {
  readonly list: () => Promise<readonly NexumSkillRegistration[]>
  readonly save: (registration: NexumSkillRegistration) => Promise<void>
  readonly remove: (address: string) => Promise<void>
}

/** 外部 Skill 来源端口；不负责注册生命周期和冲突决策。 */
export interface NexumSkillSource {
  readonly discover: () => Promise<readonly NexumSkillCandidate[]>
  readonly scan: (registration: NexumSkillRegistration) => Promise<NexumSkillCandidate>
  readonly normalizeAddress: (address: string) => string
  readonly isConfiguredAddress?: (address: string) => boolean
  readonly remove?: (address: string) => Promise<void>
}

export type NexumSkillRegistryErrorCode = "builtin" | "source_not_removable" | "source_remove_failed" | "persistence_failed"

/**
 * Skill Registry 生命周期错误，供控制面映射稳定公共错误。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-28
 */
export class NexumSkillRegistryError extends Error {
  constructor(
    readonly code: NexumSkillRegistryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumSkillRegistryError"
  }
}

export interface NexumSkillRegistry {
  readonly register: (address: string) => Promise<NexumSkillSummary>
  readonly refresh: (id?: string) => Promise<void>
  readonly list: () => Promise<readonly NexumSkillSummary[]>
  readonly get: (id: string) => Promise<NexumSkillPackage | undefined>
  readonly unregister: (id: string) => Promise<void>
  readonly remove: (id: string) => Promise<void>
}
