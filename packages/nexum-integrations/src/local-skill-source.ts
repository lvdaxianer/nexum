/** 本地 Skill 目录的发现、校验和文件读取实现。 */

import { createHash } from "node:crypto"
import { lstat, readFile, readdir } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { basename, join, posix, resolve } from "node:path"
import { redactNexumSensitiveText } from "@nexum/core"
import type {
  NexumSkillCandidate,
  NexumSkillRegistration,
  NexumSkillSource,
  NexumSkillSourceType,
  NexumSkillStatus,
} from "@nexum/core"

const defaultMaxFileBytes = 512 * 1024
const localSourceType: NexumSkillSourceType = "local-directory"
const skillIDPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 本地 Skill 来源的配置。 */
export interface LocalSkillSourceOptions {
  readonly roots: readonly string[]
  readonly maxFileBytes?: number
}

/** 创建本地 Skill 目录来源。 */
export function createLocalSkillSource(options: LocalSkillSourceOptions): NexumSkillSource {
  const roots = [...new Set(options.roots.map((root) => resolve(root)))]
  const maxFileBytes = options.maxFileBytes ?? defaultMaxFileBytes
  return {
    discover: async () => (await Promise.all(roots.map((root) => scanRoot(root, maxFileBytes)))).flat(),
    scan: async (registration) => scanSkillDirectory(registration.address, basename(registration.address) || "registered-skill", maxFileBytes, registration),
    normalizeAddress,
  }
}

interface ParsedFrontmatter {
  readonly name?: string
  readonly description?: string
  readonly version?: string
}

async function scanRoot(root: string, maxFileBytes: number): Promise<NexumSkillCandidate[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  return Promise.all(directories.map((entry) => scanSkillDirectory(join(root, entry.name), entry.name, maxFileBytes)))
}

async function scanSkillDirectory(
  skillRoot: string,
  fallbackID: string,
  maxFileBytes: number,
  registration?: NexumSkillRegistration,
): Promise<NexumSkillCandidate> {
  const contents = new Map<string, string>()
  const diagnostics: string[] = []
  const files = await loadSkillFiles(skillRoot, contents, maxFileBytes, diagnostics)
  const main = contents.get("SKILL.md")
  const metadata = main === undefined ? undefined : parseFrontmatter(main)
  addMetadataDiagnostics(fallbackID, metadata, main, diagnostics)
  const id = metadata?.name ?? fallbackID
  const status: NexumSkillStatus = diagnostics.length === 0 ? "ready" : "invalid"
  const summary = {
    id,
    name: isSafeMetadata(metadata?.name ?? fallbackID) ? metadata?.name ?? fallbackID : fallbackID,
    description: redactNexumSensitiveText(metadata?.description ?? ""),
    ...(metadata?.version && isSafeMetadata(metadata.version) ? { version: metadata.version } : {}),
    digest: digestFiles(contents),
    fileCount: files.length,
    files,
    status,
    diagnostics,
    sourceType: localSourceType,
    ...(registration?.registeredAt ? { registeredAt: registration.registeredAt } : {}),
    ...(registration ? { updatedAt: registration.updatedAt } : {}),
  }
  return {
    ...summary,
    address: skillRoot,
    read: async (relativePath) => {
      const normalized = normalizeSkillPath(relativePath)
      const content = contents.get(normalized)
      if (content === undefined) throw new Error("Skill 文件不存在")
      return content
    },
  }
}

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

async function collectFiles(
  root: string,
  relativeDirectory: string,
  contents: Map<string, string>,
  maxFileBytes: number,
  diagnostics: string[],
): Promise<string[]> {
  const entries = await readDirectory(join(root, relativeDirectory), diagnostics)
  const files = await Promise.all(entries.map((entry) => collectEntry(root, relativeDirectory, entry, contents, maxFileBytes, diagnostics)))
  return files.flat().sort()
}

async function readDirectory(directory: string, diagnostics: string[]): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    diagnostics.push("skill files are not readable")
    return []
  }
}

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

async function readSkillFile(absolutePath: string, maxFileBytes: number, diagnostics: string[]): Promise<string | undefined> {
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

function addMetadataDiagnostics(
  fallbackID: string,
  metadata: ParsedFrontmatter | undefined,
  main: string | undefined,
  diagnostics: string[],
): void {
  if (main === undefined) diagnostics.push("missing SKILL.md")
  if (main !== undefined && metadata === undefined) diagnostics.push("invalid SKILL.md frontmatter")
  const id = metadata?.name ?? fallbackID
  if (!skillIDPattern.test(id)) diagnostics.push("skill id is invalid")
  if (main !== undefined && !metadata?.description) diagnostics.push("missing skill description")
  if (main !== undefined && metadata?.version && !isSafeMetadata(metadata.version)) diagnostics.push("skill version is invalid")
}

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
  return { name: values.name, description: values.description, ...(values.version ? { version: values.version } : {}) }
}

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

function normalizeAddress(value: string): string {
  const address = value.trim()
  if (!address) throw new Error("Skill 地址不能为空")
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(address)) throw new Error("当前仅支持本地 Skill 目录地址")
  return resolve(address)
}

function normalizeSkillPath(value: string): string {
  if (!value || value.includes("\\") || value.includes("\0")) throw new Error("Skill 文件路径无效")
  const normalized = posix.normalize(value)
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../") || posix.isAbsolute(normalized)) {
    throw new Error("Skill 文件路径越界")
  }
  return normalized
}

function toRelativePath(value: string): string {
  return value.split("\\").join("/")
}

function isSafeMetadata(value: string): boolean {
  return value.length > 0 && !value.includes("\n") && !value.includes("\r")
}
