/** Nexum Skill 注册生命周期、候选聚合和冲突编排。 */

import {
  NexumSkillRegistryError,
  type NexumSkillCandidate,
  type NexumSkillPackage,
  type NexumSkillRegistration,
  type NexumSkillRegistrationStore,
  type NexumSkillRegistry,
  type NexumSkillSource,
  type NexumSkillSourceKind,
  type NexumSkillSummary,
} from "@nexum/core"
import { createFileSkillRegistrationStore } from "@nexum/persistence-file"
import { createInMemorySkillRegistrationStore } from "@nexum/persistence-memory"
import { createLocalSkillSource } from "@nexum/integrations"

/** Skill Registry 的可替换来源和注册存储配置。 */
export interface NexumSkillRegistryOptions {
  readonly roots?: readonly string[]
  readonly maxFileBytes?: number
  readonly filePath?: string
  readonly source?: NexumSkillSource
  readonly registrationStore?: NexumSkillRegistrationStore
}

const localSourceType = "local-directory" as const

/** 创建只负责 Skill 应用生命周期的 Registry。 */
export function createNexumSkillRegistry(options: NexumSkillRegistryOptions): NexumSkillRegistry {
  const source = options.source ?? createLocalSkillSource({ roots: options.roots ?? [], maxFileBytes: options.maxFileBytes })
  const registrationsStore = options.registrationStore ?? (options.filePath
    ? createFileSkillRegistrationStore({ filePath: options.filePath })
    : createInMemorySkillRegistrationStore())
  let candidates = new Map<string, NexumSkillCandidate>()
  let registrations = new Map<string, NexumSkillRegistration>()
  let loaded: Promise<void> | undefined
  let lifecycle = Promise.resolve()

  return {
    register: (address) => runExclusive(() => registerSource(address)),
    refresh: (id) => runExclusive(() => refreshSkills(id)),
    list: async () => listSkills(),
    get: async (id) => getSkill(id),
    unregister: (id) => runExclusive(() => unregisterSkill(id)),
    remove: (id) => runExclusive(() => removeSkill(id)),
  }

  async function registerSource(address: string): Promise<NexumSkillSummary> {
    await ensureLoaded()
    const normalizedAddress = source.normalizeAddress(address)
    const previous = registrations.get(normalizedAddress)
    const sourceKind = sourceKindForAddress(normalizedAddress, previous)
    registrations.set(normalizedAddress, createRegistration(normalizedAddress, previous, sourceKind))
    await registrationsStore.save(registrations.get(normalizedAddress)!)
    await refreshSkills()
    const candidate = findCandidateByAddress(normalizedAddress)
    if (!candidate) throw new Error("Skill 注册失败")
    return copySummary(candidate)
  }

  async function refreshSkills(id?: string): Promise<void> {
    await ensureLoaded()
    const discovered = registrations.size === 0
      ? (await source.discover()).map((candidate) => withSourceKind(candidate, candidate.sourceKind ?? sourceKindForAddress(candidate.address)))
      : []
    const sources = selectSources(id)
    const registered = await Promise.all(
      sources.map(async (registration) => withSourceKind(await source.scan(registration), registration.sourceKind ?? sourceKindForAddress(registration.address))),
    )
    const byAddress = new Map([...discovered, ...registered].map((candidate) => [candidate.address, candidate]))
    const refreshedAddresses = new Set(registered.map((candidate) => candidate.address))
    const untouched = id
      ? [...candidates.values()].filter((candidate) => !refreshedAddresses.has(candidate.address))
      : []
    candidates = groupCandidates([...untouched, ...byAddress.values()])
    const updated = updateRegistrations(registrations, [...byAddress.values()])
    registrations = updated
    await Promise.all(
      [...updated.values()]
        .filter((registration) => byAddress.has(registration.address))
        .map((registration) => registrationsStore.save(registration)),
    )
  }

  async function listSkills(): Promise<readonly NexumSkillSummary[]> {
    await ensureLoaded()
    return [...candidates.values()].map(copySummary).sort(compareSummary)
  }

  async function getSkill(id: string): Promise<NexumSkillPackage | undefined> {
    await ensureLoaded()
    const candidate = candidates.get(id)
    if (!candidate || candidate.status !== "ready") return undefined
    return { ...copySummary(candidate), read: candidate.read }
  }

  async function unregisterSkill(id: string): Promise<void> {
    await ensureLoaded()
    const addresses = findRegisteredAddresses(id)
    if (addresses.length === 0) throw new Error("Skill 未注册")
    if (addresses.some((address) => registrations.get(address)?.sourceKind === "builtin")) {
      throw new NexumSkillRegistryError("builtin", "内置 Skill 不能取消注册，请删除 root 下的 Skill 目录")
    }
    await removeRegistrations(addresses)
    addresses.forEach((address) => registrations.delete(address))
    candidates.delete(id)
    await refreshSkills()
  }

  /**
   * 删除配置 root 下的内置 Skill 源目录并清理 Registry 状态。
   *
   * @param id - Skill ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  async function removeSkill(id: string): Promise<void> {
    await ensureLoaded()
    const addresses = findRegisteredAddresses(id)
    if (addresses.length === 0) throw new Error("Skill 未注册")
    const current = candidates.get(id)
    if (current?.status === "conflict") throw new NexumSkillRegistryError("source_not_removable", "冲突 Skill 不能按 ID 删除源目录")
    const remove = source.remove
    if (addresses.some((address) => registrations.get(address)?.sourceKind !== "builtin") || !remove) {
      throw new NexumSkillRegistryError("source_not_removable", "只有内置 Skill 支持删除源目录")
    }
    const registrationsToRestore = addresses.map((address) => registrations.get(address)!)
    await Promise.all(addresses.map(async (address) => verifySkillIdentity(id, registrations.get(address)!)))
    await removeRegistrations(addresses)
    try {
      await Promise.all(addresses.map((address) => remove(address)))
    } catch {
      await restoreRegistrations(registrationsToRestore)
      throw new NexumSkillRegistryError("source_remove_failed", "Skill 源目录删除失败，注册记录已保留")
    }
    addresses.forEach((address) => registrations.delete(address))
    candidates.delete(id)
    await refreshSkills()
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded) return loaded
    loaded = registrationsStore.list().then(async (items) => {
      registrations = new Map(items.map((registration) => [registration.address, normalizeRegistration(registration, sourceKindForAddress(registration.address, registration))]))
      if (registrations.size > 0) return
      const discovered = (await source.discover()).map((candidate) => withSourceKind(candidate, candidate.sourceKind ?? sourceKindForAddress(candidate.address)))
      registrations = new Map(discovered.map((candidate) => [candidate.address, createRegistration(candidate.address, undefined, candidate.sourceKind ?? sourceKindForAddress(candidate.address))]))
      await Promise.all([...registrations.values()].map((registration) => registrationsStore.save(registration)))
      candidates = groupCandidates(discovered)
    })
    return loaded
  }

  function selectSources(id: string | undefined): NexumSkillRegistration[] {
    if (!id) return [...registrations.values()]
    const current = candidates.get(id)
    return [...registrations.values()].filter((registration) => registration.skillID === id || registration.address === current?.address)
  }

  function findRegisteredAddresses(id: string): string[] {
    const current = candidates.get(id)
    return [...registrations.values()]
      .filter((registration) => registration.skillID === id || registration.address === current?.address)
      .map((registration) => registration.address)
  }

  /**
   * 根据持久化记录或配置 root 判断地址的来源归属。
   *
   * @param address - 规范化后的 Skill 地址
   * @param previous - 可选的旧注册记录
   * @returns 来源归属
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  function sourceKindForAddress(address: string, previous?: NexumSkillRegistration): NexumSkillSourceKind {
    if (previous?.sourceKind) return previous.sourceKind
    if (source.isConfiguredAddress?.(address)) return "builtin"
    return "registered"
  }

  function findCandidateByAddress(address: string): NexumSkillCandidate | undefined {
    return [...candidates.values()].find((candidate) => candidate.address === address)
  }

  /**
   * 串行执行会改变 Registry 状态的生命周期操作。
   *
   * @param operation - 待执行的生命周期操作
   * @returns 操作结果
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = lifecycle.then(operation, operation)
    lifecycle = next.then(() => undefined, () => undefined)
    return next
  }

  /**
   * 删除注册记录并在部分失败时恢复已删除记录。
   *
   * @param addresses - 待删除的规范化地址
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  async function removeRegistrations(addresses: readonly string[]): Promise<void> {
    const removed: NexumSkillRegistration[] = []
    try {
      await addresses.reduce(async (pending, address) => {
        await pending
        const registration = registrations.get(address)!
        await registrationsStore.remove(address)
        removed.push(registration)
      }, Promise.resolve())
    } catch {
      await restoreRegistrations(removed)
      throw new NexumSkillRegistryError("persistence_failed", "Skill 注册状态保存失败，源目录未改动")
    }
  }

  /**
   * 恢复已删除的注册记录并等待所有恢复结果。
   *
   * @param registrationsToRestore - 要恢复的注册记录
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  async function restoreRegistrations(registrationsToRestore: readonly NexumSkillRegistration[]): Promise<void> {
    const restored = await Promise.allSettled(registrationsToRestore.map((registration) => registrationsStore.save(registration)))
    if (restored.some((result) => result.status === "rejected")) {
      throw new NexumSkillRegistryError("persistence_failed", "Skill 注册状态恢复失败，请刷新 Registry")
    }
  }

  /**
   * 删除前重新扫描并确认源目录仍对应请求中的 Skill。
   *
   * @param id - 请求中的 Skill ID
   * @param registration - 当前注册记录
   * @returns 完成校验的 Promise
   * @author lvdaxianer@yeah.net
   * @date 2026-11-28
   */
  async function verifySkillIdentity(id: string, registration: NexumSkillRegistration): Promise<void> {
    const current = await source.scan(registration)
    if (current.id !== id) throw new NexumSkillRegistryError("source_not_removable", "Skill 源目录与当前 ID 不匹配")
  }
}

function createRegistration(
  address: string,
  previous?: NexumSkillRegistration,
  sourceKind: NexumSkillSourceKind = previous?.sourceKind ?? "registered",
  now = new Date().toISOString(),
): NexumSkillRegistration {
  return {
    address,
    sourceType: localSourceType,
    sourceKind,
    ...(previous?.skillID ? { skillID: previous.skillID } : {}),
    registeredAt: previous?.registeredAt ?? now,
    updatedAt: now,
    ...(previous?.digest ? { digest: previous.digest } : {}),
    ...(previous?.status ? { status: previous.status } : {}),
    ...(previous?.diagnostics ? { diagnostics: previous.diagnostics } : {}),
  }
}

/**
 * 为旧注册记录补齐来源归属。
 *
 * @param registration - 旧注册记录
 * @param sourceKind - 推断出的来源归属
 * @returns 兼容当前模型的注册记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-28
 */
function normalizeRegistration(registration: NexumSkillRegistration, sourceKind: NexumSkillSourceKind): NexumSkillRegistration {
  return registration.sourceKind === sourceKind ? registration : { ...registration, sourceKind }
}

function updateRegistrations(
  sources: ReadonlyMap<string, NexumSkillRegistration>,
  refreshed: readonly NexumSkillCandidate[],
): Map<string, NexumSkillRegistration> {
  const byAddress = new Map(refreshed.map((candidate) => [candidate.address, candidate]))
  const now = new Date().toISOString()
  return new Map(
    [...sources.entries()].map(([address, registration]) => {
      const candidate = byAddress.get(address)
      if (!candidate) return [address, registration]
      return [
        address,
        {
          ...registration,
          sourceKind: candidate.sourceKind ?? registration.sourceKind ?? "registered",
          skillID: candidate.id,
          updatedAt: now,
          digest: candidate.digest,
          status: candidate.status,
          diagnostics: candidate.diagnostics,
        },
      ]
    }),
  )
}

/**
 * 为来源扫描候选绑定来源归属。
 *
 * @param candidate - 来源扫描候选
 * @param sourceKind - 来源归属
 * @returns 带来源归属的候选
 * @author lvdaxianer@yeah.net
 * @date 2026-11-28
 */
function withSourceKind(candidate: NexumSkillCandidate, sourceKind: NexumSkillSourceKind): NexumSkillCandidate {
  return candidate.sourceKind === sourceKind ? candidate : { ...candidate, sourceKind }
}

function groupCandidates(discovered: readonly NexumSkillCandidate[]): Map<string, NexumSkillCandidate> {
  const grouped = new Map<string, NexumSkillCandidate[]>()
  discovered.forEach((candidate) => {
    const items = grouped.get(candidate.id) ?? []
    items.push(candidate)
    grouped.set(candidate.id, items)
  })
  return new Map([...grouped.entries()].map(([id, items]) => [id, resolveCandidates(id, items)]))
}

function resolveCandidates(id: string, candidates: readonly NexumSkillCandidate[]): NexumSkillCandidate {
  const first = candidates[0]!
  if (candidates.length === 1) return first
  return { ...first, id, status: "conflict", diagnostics: ["duplicate skill id"] }
}

function copySummary(candidate: NexumSkillCandidate): NexumSkillSummary {
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    ...(candidate.version ? { version: candidate.version } : {}),
    digest: candidate.digest,
    fileCount: candidate.fileCount,
    files: [...candidate.files],
    status: candidate.status,
    diagnostics: [...candidate.diagnostics],
    ...(candidate.sourceType ? { sourceType: candidate.sourceType } : {}),
    sourceKind: candidate.sourceKind ?? "registered",
    ...(candidate.registeredAt ? { registeredAt: candidate.registeredAt } : {}),
    ...(candidate.updatedAt ? { updatedAt: candidate.updatedAt } : {}),
  }
}

function compareSummary(left: NexumSkillSummary, right: NexumSkillSummary): number {
  return left.id.localeCompare(right.id)
}
