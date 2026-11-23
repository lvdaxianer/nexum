import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { basename, dirname, join, posix, resolve } from "node:path"
import type {
  NexumSkillPackage,
  NexumSkillRegistry,
  NexumSkillRegistryOptions,
  NexumSkillSourceType,
  NexumSkillStatus,
  NexumSkillSummary,
} from "@nexum/core"

const DEFAULT_MAX_FILE_BYTES = 512 * 1024
const LOCAL_SOURCE_TYPE: NexumSkillSourceType = "local-directory"
const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface Candidate {
  readonly address: string
  readonly summary: NexumSkillSummary
  readonly contents: ReadonlyMap<string, string>
}

interface ParsedFrontmatter {
  readonly name?: string
  readonly description?: string
  readonly version?: string
}

interface StoredRegistration {
  readonly address: string
  readonly sourceType: NexumSkillSourceType
  readonly skillID?: string
  readonly registeredAt: string
  readonly updatedAt: string
  readonly digest?: string
  readonly status?: NexumSkillStatus
  readonly diagnostics?: readonly string[]
}

interface StoredRegistryFile {
  readonly version: 1
  readonly registrations: readonly StoredRegistration[]
}

/**
 * 创建 Nexum Skill Registry。
 *
 * Registry 只读取显式注册的本地目录，并把绝对路径留在进程和本地注册文件内部。
 * @param options - 允许扫描的 Skill roots、单文件大小上限和注册文件路径
 * @returns 可注册、刷新、列出和读取 Skill 的端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
export function createNexumSkillRegistry(options: NexumSkillRegistryOptions): NexumSkillRegistry {
  const roots = [...new Set(options.roots.map((root) => resolve(root)))]
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const filePath = options.filePath ? resolve(options.filePath) : undefined
  let candidates = new Map<string, Candidate>()
  let registrations = new Map<string, StoredRegistration>()
  let loaded: Promise<void> | undefined
  let hasPersistentFile = false
  let writeQueue = Promise.resolve()

  return {
    register: async (address) => registerSource(address),
    refresh: async (id) => refreshSkills(id),
    list: async () => listSkills(),
    get: async (id) => getSkill(id),
    unregister: async (id) => unregisterSkill(id),
  }

  async function registerSource(address: string): Promise<NexumSkillSummary> {
    await ensureLoaded()
    const normalizedAddress = normalizeSourceAddress(address)
    const existing = registrations.get(normalizedAddress)
    const now = new Date().toISOString()
    registrations.set(normalizedAddress, createRegistration(normalizedAddress, existing, now))
    await persistRegistry()
    await refreshSkills()
    const candidate = findCandidateByAddress(normalizedAddress)
    if (!candidate) throw new Error("Skill 注册失败")
    return copySummary(candidate)
  }

  async function refreshSkills(id?: string): Promise<void> {
    await ensureLoaded()
    if (!filePath) {
      const discovered = await discoverCandidates(roots, maxFileBytes)
      const registered = await Promise.all([...registrations.values()].map((source) => scanRegisteredSource(source, maxFileBytes)))
      const byAddress = new Map([...discovered, ...registered].map((candidate) => [candidate.address, candidate]))
      candidates = groupCandidates([...byAddress.values()])
      registrations = updateRegistrations(
        new Map([...registrations, ...discovered.map((candidate) => [candidate.address, createRegistration(candidate.address)] as const)]),
        [...byAddress.values()],
      )
      return
    }
    await discoverInitialRoots()
    const sources = selectSources(id)
    const refreshed = await Promise.all(sources.map((source) => scanRegisteredSource(source, maxFileBytes)))
    const refreshedAddresses = new Set(refreshed.map((candidate) => candidate.address))
    const untouched = [...candidates.values()].filter((candidate) => !refreshedAddresses.has(candidate.address))
    candidates = groupCandidates([...untouched, ...refreshed])
    registrations = updateRegistrations(registrations, refreshed)
    await persistRegistry()
  }

  async function listSkills(): Promise<readonly NexumSkillSummary[]> {
    await ensureLoaded()
    return [...candidates.values()].map(copySummary).sort(compareSummary)
  }

  async function getSkill(id: string): Promise<NexumSkillPackage | undefined> {
    await ensureLoaded()
    const candidate = candidates.get(id)
    if (!candidate || candidate.summary.status !== "ready") return undefined
    return createSkillPackage(candidate)
  }

  async function unregisterSkill(id: string): Promise<void> {
    await ensureLoaded()
    const addresses = findRegisteredAddresses(id)
    if (addresses.length === 0) throw new Error("Skill 未注册")
    addresses.forEach((address) => registrations.delete(address))
    candidates.delete(id)
    await persistRegistry()
    if (filePath) await refreshSkills()
  }

  async function ensureLoaded(): Promise<void> {
    if (!filePath) return
    if (!loaded) {
      loaded = readRegistry(filePath).then((result) => {
        registrations = new Map(result.registrations.map((registration) => [registration.address, registration]))
        hasPersistentFile = result.exists
      })
    }
    await loaded
  }

  async function discoverInitialRoots(): Promise<void> {
    if (hasPersistentFile || registrations.size > 0) return
    const discovered = await discoverCandidates(roots, maxFileBytes)
    registrations = new Map(discovered.map((candidate) => [candidate.address, createRegistration(candidate.address)]))
    if (registrations.size > 0) await persistRegistry()
  }

  function selectSources(id: string | undefined): StoredRegistration[] {
    if (!id) return [...registrations.values()]
    const current = candidates.get(id)
    return [...registrations.values()].filter((source) => source.skillID === id || source.address === current?.address)
  }

  function findRegisteredAddresses(id: string): string[] {
    const current = candidates.get(id)
    return [...registrations.values()]
      .filter((source) => source.skillID === id || source.address === current?.address)
      .map((source) => source.address)
  }

  function findCandidateByAddress(address: string): Candidate | undefined {
    return [...candidates.values()].find((candidate) => candidate.address === address)
  }

  async function persistRegistry(): Promise<void> {
    if (!filePath) return
    const operation = writeQueue.then(() => writeRegistry(filePath, registrations))
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    await operation
  }
}

/**
 * 读取已注册地址并标记持久化文件是否存在。
 * @param filePath - 注册文件路径
 * @returns 注册记录和文件存在状态
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function readRegistry(filePath: string): Promise<{ readonly exists: boolean; readonly registrations: readonly StoredRegistration[] }> {
  const text = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (text === undefined) return { exists: false, registrations: [] }
  try {
    const payload = JSON.parse(text) as unknown
    if (!isStoredRegistryFile(payload)) throw new Error()
    return { exists: true, registrations: payload.registrations }
  } catch {
    return { exists: true, registrations: [] }
  }
}

/**
 * 原子写入注册文件，避免进程中断留下半个 JSON。
 * @param filePath - 注册文件路径
 * @param registrations - 当前注册记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function writeRegistry(filePath: string, registrations: ReadonlyMap<string, StoredRegistration>): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const payload: StoredRegistryFile = {
    version: 1,
    registrations: [...registrations.values()].sort(compareRegistration),
  }
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  await rename(temporaryPath, filePath)
}

/**
 * 创建或更新一个注册记录。
 * @param address - 规范化本地地址
 * @param previous - 已存在的注册记录
 * @param now - 当前 UTC 时间
 * @returns 注册记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function createRegistration(address: string, previous?: StoredRegistration, now = new Date().toISOString()): StoredRegistration {
  return {
    address,
    sourceType: LOCAL_SOURCE_TYPE,
    ...(previous?.skillID ? { skillID: previous.skillID } : {}),
    registeredAt: previous?.registeredAt ?? now,
    updatedAt: now,
    ...(previous?.digest ? { digest: previous.digest } : {}),
    ...(previous?.status ? { status: previous.status } : {}),
    ...(previous?.diagnostics ? { diagnostics: previous.diagnostics } : {}),
  }
}

/**
 * 将刷新结果写回注册记录的安全元数据。
 * @param sources - 已注册来源
 * @param refreshed - 来源扫描结果
 * @returns 更新后的来源映射
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function updateRegistrations(
  sources: ReadonlyMap<string, StoredRegistration>,
  refreshed: readonly Candidate[],
): Map<string, StoredRegistration> {
  const byAddress = new Map(refreshed.map((candidate) => [candidate.address, candidate.summary]))
  const now = new Date().toISOString()
  return new Map(
    [...sources.entries()].map(([address, source]) => {
      const summary = byAddress.get(address)
      if (!summary) return [address, source]
      return [
        address,
        {
          ...source,
          skillID: summary.id,
          updatedAt: now,
          digest: summary.digest,
          status: summary.status,
          diagnostics: summary.diagnostics,
        },
      ]
    }),
  )
}

/**
 * 扫描持久化的单个本地来源。
 * @param source - 注册来源
 * @param maxFileBytes - 单文件大小上限
 * @returns 来源候选
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function scanRegisteredSource(source: StoredRegistration, maxFileBytes: number): Promise<Candidate> {
  return scanSkillDirectory(source.address, basename(source.address) || "registered-skill", maxFileBytes, source)
}

/**
 * 扫描所有配置 root 下的一级 Skill 目录。
 * @param roots - 已规范化的 Skill roots
 * @param maxFileBytes - 单文件大小上限
 * @returns 扫描到的候选 Skill
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function discoverCandidates(roots: readonly string[], maxFileBytes: number): Promise<Candidate[]> {
  const groups = await Promise.all(roots.map((root) => scanRoot(root, maxFileBytes)))
  return groups.flat()
}

/**
 * 按 Skill ID 聚合候选并生成冲突状态。
 * @param discovered - 扫描得到的候选 Skill
 * @returns 可供 Registry 查询的候选映射
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function groupCandidates(discovered: readonly Candidate[]): Map<string, Candidate> {
  const grouped = new Map<string, Candidate[]>()
  discovered.forEach((candidate) => addCandidate(grouped, candidate))
  return new Map([...grouped.entries()].map(([id, items]) => [id, resolveCandidates(id, items)]))
}

/**
 * 把候选 Skill 追加到对应 ID 的分组。
 * @param grouped - 候选分组
 * @param candidate - 待加入候选
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function addCandidate(grouped: Map<string, Candidate[]>, candidate: Candidate): void {
  const items = grouped.get(candidate.summary.id) ?? []
  items.push(candidate)
  grouped.set(candidate.summary.id, items)
}

/**
 * 解析单个 Skill ID 的候选状态。
 * @param id - Skill ID
 * @param candidates - 同 ID 候选
 * @returns ready、invalid 或 conflict 候选
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function resolveCandidates(id: string, candidates: readonly Candidate[]): Candidate {
  const first = candidates[0]!
  if (candidates.length === 1) return first
  return {
    ...first,
    summary: { ...first.summary, id, status: "conflict", diagnostics: ["duplicate skill id"] },
  }
}

/**
 * 创建不暴露宿主路径的 Skill 包读取器。
 * @param candidate - 已通过 Registry 的候选 Skill
 * @returns 对外可读的 Skill 包
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function createSkillPackage(candidate: Candidate): NexumSkillPackage {
  return {
    ...copySummary(candidate),
    read: (relativePath) => readSkillContent(candidate, relativePath),
  }
}

/**
 * 复制 Skill 摘要，避免调用方修改 Registry 内部状态。
 * @param candidate - 候选 Skill
 * @returns 不可变视图
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function copySummary(candidate: Candidate): NexumSkillSummary {
  return {
    ...candidate.summary,
    files: [...candidate.summary.files],
    diagnostics: [...candidate.summary.diagnostics],
  }
}

/**
 * 按 ID 对 Skill 摘要排序。
 * @param left - 左侧摘要
 * @param right - 右侧摘要
 * @returns 排序结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function compareSummary(left: NexumSkillSummary, right: NexumSkillSummary): number {
  return left.id.localeCompare(right.id)
}

/**
 * 按地址对注册记录排序。
 * @param left - 左侧记录
 * @param right - 右侧记录
 * @returns 排序结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function compareRegistration(left: StoredRegistration, right: StoredRegistration): number {
  return left.address.localeCompare(right.address)
}

/**
 * 读取已注册 Skill 的相对文件。
 * @param candidate - 已注册候选
 * @param relativePath - Skill 内相对路径
 * @returns 文件文本
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function readSkillContent(candidate: Candidate, relativePath: string): Promise<string> {
  const normalized = normalizeSkillPath(relativePath)
  const content = candidate.contents.get(normalized)
  if (content === undefined) throw new Error("Skill 文件不存在")
  return content
}

/**
 * 扫描一个 Skill root 下的一级目录。
 * @param root - Skill root
 * @param maxFileBytes - 单文件大小上限
 * @returns 候选 Skill 列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function scanRoot(root: string, maxFileBytes: number): Promise<Candidate[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  return Promise.all(directories.map((entry) => scanSkillDirectory(join(root, entry.name), entry.name, maxFileBytes)))
}

/**
 * 扫描并解析一个目录型 Skill。
 * @param skillRoot - Skill 目录
 * @param fallbackID - 目录名回退 ID
 * @param maxFileBytes - 单文件大小上限
 * @param registration - 可选注册元数据
 * @returns 候选 Skill
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function scanSkillDirectory(
  skillRoot: string,
  fallbackID: string,
  maxFileBytes: number,
  registration?: StoredRegistration,
): Promise<Candidate> {
  const contents = new Map<string, string>()
  const diagnostics: string[] = []
  const files = await loadSkillFiles(skillRoot, contents, maxFileBytes, diagnostics)
  const main = contents.get("SKILL.md")
  const metadata = main === undefined ? undefined : parseFrontmatter(main)
  const summary = createSummary(fallbackID, files, contents, metadata, diagnostics, main, registration)
  return { address: skillRoot, contents, summary }
}

/**
 * 加载 Skill 文件并收集结构校验诊断。
 * @param skillRoot - Skill 目录
 * @param contents - 文件内容缓存
 * @param maxFileBytes - 单文件大小上限
 * @param diagnostics - 诊断收集器
 * @returns 安全相对文件列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function loadSkillFiles(
  skillRoot: string,
  contents: Map<string, string>,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string[]> {
  try {
    const rootStat = await lstat(skillRoot)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      diagnostics.push("skill root must be a real directory")
      return []
    }
    return collectFiles(skillRoot, "", contents, maxFileBytes, diagnostics)
  } catch {
    diagnostics.push("skill root is not readable")
    return []
  }
}

/**
 * 构造不包含宿主路径和敏感值的 Skill 摘要。
 * @param fallbackID - 目录名回退 ID
 * @param files - 文件清单
 * @param contents - 文件内容
 * @param metadata - frontmatter 元数据
 * @param diagnostics - 校验诊断
 * @param main - SKILL.md 内容
 * @param registration - 可选注册元数据
 * @returns Skill 摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function createSummary(
  fallbackID: string,
  files: readonly string[],
  contents: ReadonlyMap<string, string>,
  metadata: ParsedFrontmatter | undefined,
  diagnostics: string[],
  main: string | undefined,
  registration?: StoredRegistration,
): NexumSkillSummary {
  addMetadataDiagnostics(fallbackID, metadata, main, diagnostics)
  const id = metadata?.name ?? fallbackID
  const name = isSafeMetadata(metadata?.name ?? fallbackID) ? metadata?.name ?? fallbackID : fallbackID
  return {
    id,
    name,
    description: redactSensitiveText(metadata?.description ?? ""),
    ...(metadata?.version && isSafeMetadata(metadata.version) ? { version: metadata.version } : {}),
    digest: digestFiles(contents),
    fileCount: files.length,
    files,
    status: diagnostics.length === 0 ? "ready" : "invalid",
    diagnostics,
    sourceType: LOCAL_SOURCE_TYPE,
    ...(registration?.registeredAt ? { registeredAt: registration.registeredAt } : {}),
    ...(registration ? { updatedAt: registration.updatedAt } : {}),
  }
}

/**
 * 追加 Skill frontmatter 的稳定诊断。
 * @param fallbackID - 目录名回退 ID
 * @param metadata - frontmatter 元数据
 * @param main - SKILL.md 内容
 * @param diagnostics - 诊断收集器
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function addMetadataDiagnostics(
  fallbackID: string,
  metadata: ParsedFrontmatter | undefined,
  main: string | undefined,
  diagnostics: string[],
): void {
  if (main === undefined) diagnostics.push("missing SKILL.md")
  if (main !== undefined && metadata === undefined) diagnostics.push("invalid SKILL.md frontmatter")
  const id = metadata?.name ?? fallbackID
  if (!SKILL_ID.test(id)) diagnostics.push("skill id is invalid")
  if (main !== undefined && !metadata?.description) diagnostics.push("missing skill description")
  if (main !== undefined && metadata?.version && !isSafeMetadata(metadata.version)) {
    diagnostics.push("skill version is invalid")
  }
}

/**
 * 递归读取目录中的普通文件。
 * @param root - Skill 根目录
 * @param relativeDirectory - 当前相对目录
 * @param contents - 文件内容缓存
 * @param maxFileBytes - 单文件大小上限
 * @param diagnostics - 诊断收集器
 * @returns 当前目录下的相对文件列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function collectFiles(
  root: string,
  relativeDirectory: string,
  contents: Map<string, string>,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string[]> {
  const current = join(root, relativeDirectory)
  const entries = await readDirectory(current, diagnostics)
  const files = await Promise.all(
    entries.map((entry) => collectEntry(root, relativeDirectory, entry, contents, maxFileBytes, diagnostics)),
  )
  return files.flat().sort()
}

/**
 * 读取目录并把 IO 错误转换为稳定诊断。
 * @param directory - 进程内目录路径
 * @param diagnostics - 诊断收集器
 * @returns 目录项列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function readDirectory(directory: string, diagnostics: string[]): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    diagnostics.push("skill files are not readable")
    return []
  }
}

/**
 * 读取或递归处理一个目录项。
 * @param root - Skill 根目录
 * @param relativeDirectory - 当前相对目录
 * @param entry - 目录项
 * @param contents - 文件内容缓存
 * @param maxFileBytes - 单文件大小上限
 * @param diagnostics - 诊断收集器
 * @returns 当前目录项产生的相对文件列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function collectEntry(
  root: string,
  relativeDirectory: string,
  entry: Dirent,
  contents: Map<string, string>,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string[]> {
  const relativePath = toRelativePath(join(relativeDirectory, entry.name))
  if (entry.isSymbolicLink()) {
    diagnostics.push("skill contains a symbolic link")
    return []
  }
  if (entry.isDirectory()) return collectFiles(root, relativePath, contents, maxFileBytes, diagnostics)
  if (!entry.isFile()) {
    diagnostics.push("skill contains an unsupported file type")
    return []
  }
  const content = await readSkillFile(join(root, relativePath), maxFileBytes, diagnostics)
  if (content === undefined) return []
  contents.set(relativePath, content)
  return [relativePath]
}

/**
 * 读取一个 Skill 文件并执行大小限制。
 * @param absolutePath - 进程内绝对路径
 * @param maxFileBytes - 单文件大小上限
 * @param diagnostics - 诊断收集器
 * @returns 文件文本或 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function readSkillFile(
  absolutePath: string,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string | undefined> {
  try {
    const file = await readFile(absolutePath)
    if (file.byteLength > maxFileBytes) {
      diagnostics.push("skill file exceeds the size limit")
      return undefined
    }
    return file.toString("utf8")
  } catch {
    diagnostics.push("skill file is not readable")
    return undefined
  }
}

/**
 * 解析 Skill.md 的简单 frontmatter。
 * @param content - SKILL.md 文本
 * @returns 已支持的元数据或 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function parseFrontmatter(content: string): ParsedFrontmatter | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return undefined
  const values: Record<string, string> = {}
  match[1]!.split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(":")
    if (separator <= 0) return
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
    values[key] = value
  })
  if (!values.name || !values.description) return undefined
  return {
    name: values.name,
    description: values.description,
    ...(values.version ? { version: values.version } : {}),
  }
}

/**
 * 计算 Skill 全部文件的稳定 SHA-256 摘要。
 * @param contents - 相对路径到文件内容的映射
 * @returns 十六进制摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function digestFiles(contents: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256")
  ;[...contents.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([relativePath, content]) => {
      hash.update(relativePath)
      hash.update("\0")
      hash.update(content)
      hash.update("\0")
    })
  return hash.digest("hex")
}

/**
 * 将来源地址规范化并拒绝远程 URL。
 * @param value - 用户提供的地址
 * @returns 本地绝对目录地址
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function normalizeSourceAddress(value: string): string {
  const address = value.trim()
  if (!address) throw new Error("Skill 地址不能为空")
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(address)) throw new Error("当前仅支持本地 Skill 目录地址")
  return resolve(address)
}

/**
 * 将宿主路径转换为稳定的 POSIX 相对路径。
 * @param value - 宿主路径
 * @returns POSIX 相对路径
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function toRelativePath(value: string): string {
  return value.split("\\").join("/")
}

/**
 * 校验 Skill 文件读取路径，阻止目录逃逸。
 * @param value - Skill 内相对路径
 * @returns 规范化路径
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function normalizeSkillPath(value: string): string {
  if (!value || value.includes("\\") || value.includes("\0")) throw new Error("Skill 文件路径无效")
  const normalized = posix.normalize(value)
  const escapesRoot = normalized.startsWith("../") || normalized.includes("/../")
  if (normalized === "." || escapesRoot || posix.isAbsolute(normalized)) {
    throw new Error("Skill 文件路径越界")
  }
  return normalized
}

/**
 * 校验 frontmatter 值不包含换行控制字符。
 * @param value - 待校验值
 * @returns 是否安全
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function isSafeMetadata(value: string): boolean {
  return value.length > 0 && !value.includes("\n") && !value.includes("\r")
}

/**
 * 脱敏 frontmatter 中可能出现的凭据值。
 * @param value - 待脱敏文本
 * @returns 脱敏文本
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function redactSensitiveText(value: string): string {
  return value.replace(
    /((?:authorization|api[_-]?key|token|password|secret)\s*[:=]\s*(?:bearer\s+)?)([^\s'",;]+)/gi,
    "$1[REDACTED]",
  )
}

/**
 * 校验持久化注册文件结构。
 * @param value - 未信任 JSON 值
 * @returns 是否是可读取的注册文件
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function isStoredRegistryFile(value: unknown): value is StoredRegistryFile {
  return isRecord(value) && value.version === 1 && Array.isArray(value.registrations) && value.registrations.every(isStoredRegistration)
}

/**
 * 校验单条注册记录结构。
 * @param value - 未信任 JSON 值
 * @returns 是否是安全注册记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function isStoredRegistration(value: unknown): value is StoredRegistration {
  return (
    isRecord(value) &&
    typeof value.address === "string" &&
    value.sourceType === LOCAL_SOURCE_TYPE &&
    typeof value.registeredAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.skillID === undefined || typeof value.skillID === "string") &&
    (value.digest === undefined || typeof value.digest === "string") &&
    (value.status === undefined || value.status === "ready" || value.status === "invalid" || value.status === "conflict") &&
    (value.diagnostics === undefined || Array.isArray(value.diagnostics))
  )
}

/**
 * 判断文件是否不存在。
 * @param error - 文件系统错误
 * @returns 是否为缺失文件
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}

/**
 * 判断未知值是否为普通对象。
 * @param value - 未知值
 * @returns 是否为记录对象
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
