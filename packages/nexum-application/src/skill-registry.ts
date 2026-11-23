/** Nexum Skill 注册生命周期、候选聚合和冲突编排。 */

import {
  type NexumSkillCandidate,
  type NexumSkillPackage,
  type NexumSkillRegistration,
  type NexumSkillRegistrationStore,
  type NexumSkillRegistry,
  type NexumSkillSource,
  type NexumSkillSummary,
} from "@nexum/core"
import { createFileSkillRegistrationStore, createInMemorySkillRegistrationStore } from "@nexum/persistence"
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

  return {
    register: async (address) => registerSource(address),
    refresh: async (id) => refreshSkills(id),
    list: async () => listSkills(),
    get: async (id) => getSkill(id),
    unregister: async (id) => unregisterSkill(id),
  }

  async function registerSource(address: string): Promise<NexumSkillSummary> {
    await ensureLoaded()
    const normalizedAddress = source.normalizeAddress(address)
    const previous = registrations.get(normalizedAddress)
    registrations.set(normalizedAddress, createRegistration(normalizedAddress, previous))
    await registrationsStore.save(registrations.get(normalizedAddress)!)
    await refreshSkills()
    const candidate = findCandidateByAddress(normalizedAddress)
    if (!candidate) throw new Error("Skill 注册失败")
    return copySummary(candidate)
  }

  async function refreshSkills(id?: string): Promise<void> {
    await ensureLoaded()
    const discovered = registrations.size === 0 ? await source.discover() : []
    const sources = selectSources(id)
    const registered = await Promise.all(sources.map((registration) => source.scan(registration)))
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
    await Promise.all(addresses.map((address) => registrationsStore.remove(address)))
    addresses.forEach((address) => registrations.delete(address))
    candidates.delete(id)
    await refreshSkills()
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded) return loaded
    loaded = registrationsStore.list().then(async (items) => {
      registrations = new Map(items.map((registration) => [registration.address, registration]))
      if (registrations.size > 0) return
      const discovered = await source.discover()
      registrations = new Map(discovered.map((candidate) => [candidate.address, createRegistration(candidate.address)]))
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

  function findCandidateByAddress(address: string): NexumSkillCandidate | undefined {
    return [...candidates.values()].find((candidate) => candidate.address === address)
  }
}

function createRegistration(
  address: string,
  previous?: NexumSkillRegistration,
  now = new Date().toISOString(),
): NexumSkillRegistration {
  return {
    address,
    sourceType: localSourceType,
    ...(previous?.skillID ? { skillID: previous.skillID } : {}),
    registeredAt: previous?.registeredAt ?? now,
    updatedAt: now,
    ...(previous?.digest ? { digest: previous.digest } : {}),
    ...(previous?.status ? { status: previous.status } : {}),
    ...(previous?.diagnostics ? { diagnostics: previous.diagnostics } : {}),
  }
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
    ...(candidate.registeredAt ? { registeredAt: candidate.registeredAt } : {}),
    ...(candidate.updatedAt ? { updatedAt: candidate.updatedAt } : {}),
  }
}

function compareSummary(left: NexumSkillSummary, right: NexumSkillSummary): number {
  return left.id.localeCompare(right.id)
}
