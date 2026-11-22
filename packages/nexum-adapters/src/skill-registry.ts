import { createHash } from "node:crypto"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"

const DEFAULT_MAX_FILE_BYTES = 512 * 1024
const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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

interface Candidate {
  readonly summary: NexumSkillSummary
  readonly contents: ReadonlyMap<string, string>
}

interface ParsedFrontmatter {
  readonly name?: string
  readonly description?: string
  readonly version?: string
}

/**
 * 创建 Nexum Skill Registry。
 *
 * Registry 只读取配置 root 下的目录型 Skill，并把绝对路径留在进程内部。
 * @param options - 允许扫描的 Skill roots 与单文件大小上限
 * @returns 可刷新、列出和读取已注册 Skill 的端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
export function createNexumSkillRegistry(options: NexumSkillRegistryOptions): NexumSkillRegistry {
  const roots = [...new Set(options.roots.map((root) => path.resolve(root)))]
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  let candidates = new Map<string, Candidate>()

  return {
    async refresh() {
      candidates = groupCandidates(await discoverCandidates(roots, maxFileBytes))
    },
    async list() {
      return [...candidates.values()].map(copySummary).sort(compareSummary)
    },
    async get(id) {
      const candidate = candidates.get(id)
      if (!candidate || candidate.summary.status !== "ready") return undefined
      return createSkillPackage(candidate)
    },
  }
}

/**
 * 并行扫描所有配置的 Skill root。
 *
 * @param roots - 已规范化的 Skill root 列表
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
 *
 * @param discovered - 扫描得到的候选 Skill
 * @returns 可供 Registry 查询的候选映射
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function groupCandidates(discovered: readonly Candidate[]): Map<string, Candidate> {
  const grouped = new Map<string, Candidate[]>()
  for (const candidate of discovered) addCandidate(grouped, candidate)
  return new Map([...grouped.entries()].map(([id, items]) => [id, resolveCandidates(id, items)]))
}

/**
 * 把候选 Skill 追加到对应 ID 的分组。
 *
 * @param grouped - 候选分组
 * @param candidate - 待加入候选
 */
function addCandidate(grouped: Map<string, Candidate[]>, candidate: Candidate): void {
  const items = grouped.get(candidate.summary.id) ?? []
  items.push(candidate)
  grouped.set(candidate.summary.id, items)
}

/**
 * 解析单个 Skill ID 的候选状态。
 *
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
 *
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
 *
 * @param candidate - 候选 Skill
 * @returns 不可变视图
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function copySummary(candidate: Candidate): NexumSkillSummary {
  return { ...candidate.summary, files: [...candidate.summary.files] }
}

/**
 * 按 ID 对 Skill 摘要排序。
 *
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
 * 读取已注册 Skill 的相对文件。
 *
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
 *
 * @param root - Skill root
 * @param maxFileBytes - 单文件大小上限
 * @returns 候选 Skill 列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function scanRoot(root: string, maxFileBytes: number): Promise<Candidate[]> {
  let entries: import("node:fs").Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  return Promise.all(directories.map((entry) => scanSkillDirectory(root, entry.name, maxFileBytes)))
}

/**
 * 扫描并解析一个目录型 Skill。
 *
 * @param root - Skill root
 * @param directory - 候选目录名称
 * @param maxFileBytes - 单文件大小上限
 * @returns 候选 Skill
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function scanSkillDirectory(root: string, directory: string, maxFileBytes: number): Promise<Candidate> {
  const skillRoot = path.join(root, directory)
  const fallbackID = directory
  const contents = new Map<string, string>()
  const diagnostics: string[] = []
  const files = await loadSkillFiles(skillRoot, contents, maxFileBytes, diagnostics)
  const main = contents.get("SKILL.md")
  const metadata = main === undefined ? undefined : parseFrontmatter(main)
  return {
    contents,
    summary: createSummary(fallbackID, files, contents, metadata, diagnostics, main),
  }
}

/**
 * 加载 Skill 文件并收集结构校验诊断。
 *
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
 *
 * @param fallbackID - 目录名回退 ID
 * @param files - 文件清单
 * @param contents - 文件内容
 * @param metadata - frontmatter 元数据
 * @param diagnostics - 校验诊断
 * @param main - SKILL.md 内容
 * @returns Skill 摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function createSummary(
  fallbackID: string,
  files: readonly string[],
  contents: ReadonlyMap<string, string>,
  metadata: ParsedFrontmatter | undefined,
  diagnostics: string[],
  main: string | undefined,
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
  }
}

/**
 * 追加 Skill frontmatter 的稳定诊断。
 *
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
 *
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
  const current = path.join(root, relativeDirectory)
  const entries = await readDirectory(current, diagnostics)
  const files = await Promise.all(
    entries.map((entry) => collectEntry(root, relativeDirectory, entry, contents, maxFileBytes, diagnostics)),
  )
  return files.flat().sort()
}

/**
 * 读取目录并把 IO 错误转换为稳定诊断。
 *
 * @param directory - 进程内目录路径
 * @param diagnostics - 诊断收集器
 * @returns 目录项列表
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function readDirectory(directory: string, diagnostics: string[]): Promise<import("node:fs").Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    diagnostics.push("skill files are not readable")
    return []
  }
}

/**
 * 读取或递归处理一个目录项。
 *
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
  entry: import("node:fs").Dirent,
  contents: Map<string, string>,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string[]> {
  const relativePath = toRelativePath(path.join(relativeDirectory, entry.name))
  if (entry.isSymbolicLink()) {
    diagnostics.push("skill contains a symbolic link")
    return []
  }
  if (entry.isDirectory()) return collectFiles(root, relativePath, contents, maxFileBytes, diagnostics)
  if (!entry.isFile()) {
    diagnostics.push("skill contains an unsupported file type")
    return []
  }
  const content = await readSkillFile(path.join(root, relativePath), maxFileBytes, diagnostics)
  if (content === undefined) return []
  contents.set(relativePath, content)
  return [relativePath]
}

/**
 * 读取一个 Skill 文件并执行大小限制。
 *
 * @param absolutePath - 进程内绝对路径
 * @param maxFileBytes - 单文件大小上限
 * @param diagnostics - 诊断收集器
 * @returns 文本内容或 undefined
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
 *
 * @param content - SKILL.md 文本
 * @returns 已支持的元数据或 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function parseFrontmatter(content: string): ParsedFrontmatter | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return undefined
  const values: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
    values[key] = value
  }
  if (!values.name || !values.description) return undefined
  return {
    name: values.name,
    description: values.description,
    ...(values.version ? { version: values.version } : {}),
  }
}

/**
 * 计算 Skill 全部文件的稳定 SHA-256 摘要。
 *
 * @param contents - 相对路径到文件内容的映射
 * @returns 十六进制摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function digestFiles(contents: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256")
  for (const [relativePath, content] of [...contents.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(relativePath)
    hash.update("\0")
    hash.update(content)
    hash.update("\0")
  }
  return hash.digest("hex")
}

/**
 * 将宿主路径转换为稳定的 POSIX 相对路径。
 *
 * @param value - 宿主路径
 * @returns POSIX 相对路径
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function toRelativePath(value: string): string {
  return value.split(path.sep).join("/")
}

/**
 * 校验 Skill 文件读取路径，阻止目录逃逸。
 *
 * @param value - Skill 内相对路径
 * @returns 规范化路径
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function normalizeSkillPath(value: string): string {
  if (!value || value.includes("\\") || value.includes("\0")) throw new Error("Skill 文件路径无效")
  const normalized = path.posix.normalize(value)
  const escapesRoot = normalized.startsWith("../") || normalized.includes("/../")
  if (normalized === "." || escapesRoot || path.posix.isAbsolute(normalized)) {
    throw new Error("Skill 文件路径越界")
  }
  return normalized
}

/**
 * 校验 frontmatter 值不包含换行控制字符。
 *
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
 *
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
