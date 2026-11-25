/**
 * Application 层本地 Plugin Manifest 扫描与懒加载编排。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */

import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  validateNexumPluginManifest,
  type NexumPluginManifest,
  type NexumPluginRegistry,
  type NexumPluginStatus,
  type NexumPluginSummary,
} from "@nexum/core"

/** Application Plugin 来源扫描后的候选。 */
export interface NexumPluginSourceCandidate {
  readonly address: string
  readonly entryPath: string
  readonly manifest: NexumPluginManifest
}

/** Application Plugin 来源端口。 */
export interface NexumPluginSource {
  readonly discover: () => Promise<readonly NexumPluginSourceCandidate[]>
}

/** 可被激活端口继续加载的 Plugin 包。 */
export interface NexumApplicationPluginPackage {
  readonly manifest: NexumPluginManifest
  readonly summary: NexumPluginSummary
  readonly load: () => Promise<unknown>
}

/** Application 层带懒加载能力的 Plugin Registry。 */
export interface NexumApplicationPluginRegistry extends Omit<NexumPluginRegistry, "get" | "register"> {
  readonly get: (id: string) => Promise<NexumApplicationPluginPackage | undefined>
  readonly refresh: () => Promise<void>
}

/** Plugin 加载失败的稳定错误码。 */
export type NexumPluginLoaderErrorCode = "plugin_not_ready" | "plugin_load_failed"

/** Plugin 入口加载错误，避免把入口实现细节直接暴露给调用方。 */
export class NexumPluginLoaderError extends Error {
  /**
   * 创建 Plugin 入口加载错误。
   *
   * @param code - 稳定错误码
   * @param message - 面向日志或 UI 的错误消息
   * @param pluginID - 目标 Plugin ID
   * @author lvdaxianer@yeah.net
   * @date 2026-11-25
   */
  constructor(
    readonly code: NexumPluginLoaderErrorCode,
    message: string,
    readonly pluginID: string,
  ) {
    super(message)
    this.name = "NexumPluginLoaderError"
  }
}

/** 本地 Plugin Registry 的配置。 */
export interface NexumPluginRegistryOptions {
  readonly roots?: readonly string[]
  readonly source?: NexumPluginSource
}

interface PluginRecord extends NexumPluginSourceCandidate {
  status: NexumPluginStatus
  diagnostics: string[]
  loaded?: Promise<unknown>
}

const pluginManifestFile = "plugin.json"

/**
 * 创建 Application 层 Plugin Registry。
 *
 * Registry 首次读取时只扫描并解析 `plugin.json`；入口模块直到调用返回包的 `load`
 * 才动态导入。
 * @param options - 本地 Plugin 根目录或可替换来源
 * @returns 支持摘要发现和入口懒加载的 Plugin Registry
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createNexumPluginRegistry(options: NexumPluginRegistryOptions): NexumApplicationPluginRegistry {
  const source = options.source ?? createLocalPluginSource(options.roots ?? [])
  let plugins = new Map<string, PluginRecord>()
  let discovered: Promise<void> | undefined

  return {
    list: async () => {
      await ensureDiscovered()
      return [...plugins.values()].map(createSummary).sort(compareSummary)
    },
    get: async (id) => {
      await ensureDiscovered()
      const plugin = plugins.get(id)
      return plugin ? createPackage(plugin) : undefined
    },
    refresh: async () => {
      discovered = undefined
      await discoverPlugins()
    },
  }

  async function ensureDiscovered(): Promise<void> {
    if (discovered) return discovered
    discovered = discoverPlugins()
    return discovered
  }

  async function discoverPlugins(): Promise<void> {
    const candidates = await source.discover()
    plugins = groupCandidates(candidates)
  }
}

/**
 * 创建本地目录 Plugin 来源。
 *
 * 每个根目录的直接子目录都视为一个 Plugin 包，目录内必须包含 `plugin.json`。
 * @param roots - Plugin 根目录
 * @returns 只读取 Manifest 的本地来源
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
export function createLocalPluginSource(roots: readonly string[]): NexumPluginSource {
  const normalizedRoots = [...new Set(roots.map((root) => resolve(root)))]
  return {
    discover: async () => (await Promise.all(normalizedRoots.map(scanPluginRoot))).flatMap((items) => items),
  }
}

/**
 * 将来源候选按 Plugin ID 聚合，并把重复 ID 标记为不可激活。
 *
 * @param candidates - 来源扫描结果
 * @returns 按 Plugin ID 索引的运行时记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function groupCandidates(candidates: readonly NexumPluginSourceCandidate[]): Map<string, PluginRecord> {
  const grouped = new Map<string, NexumPluginSourceCandidate[]>()
  candidates.forEach((candidate) => {
    const items = grouped.get(candidate.manifest.id) ?? []
    items.push(candidate)
    grouped.set(candidate.manifest.id, items)
  })
  return new Map([...grouped.entries()].map(([id, items]) => [id, createRecord(id, items)]))
}

/**
 * 创建单个 Plugin 的运行时记录。
 *
 * @param id - Plugin ID
 * @param candidates - 同 ID 的来源候选
 * @returns 注册或冲突状态的记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function createRecord(id: string, candidates: readonly NexumPluginSourceCandidate[]): PluginRecord {
  const first = candidates[0]
  if (!first) throw new Error(`Plugin 候选为空: ${id}`)
  if (candidates.length === 1) return { ...first, status: "registered", diagnostics: [] }
  return { ...first, status: "failed", diagnostics: ["duplicate plugin id"] }
}

/**
 * 为单个记录创建包视图，避免把内部可变状态暴露给调用方。
 *
 * @param plugin - Plugin 内部记录
 * @returns 带懒加载入口的 Plugin 包
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function createPackage(plugin: PluginRecord): NexumApplicationPluginPackage {
  return { manifest: plugin.manifest, summary: createSummary(plugin), load: () => loadPlugin(plugin) }
}

/**
 * 动态导入 Plugin 入口并缓存同一加载 Promise。
 *
 * @param plugin - Plugin 内部记录
 * @returns Plugin 入口模块
 * @throws {NexumPluginLoaderError} Plugin 冲突或入口执行失败时抛出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function loadPlugin(plugin: PluginRecord): Promise<unknown> {
  if (plugin.loaded) return plugin.loaded
  if (plugin.status !== "registered") {
    return Promise.reject(
      new NexumPluginLoaderError("plugin_not_ready", `Plugin 不可加载: ${plugin.manifest.id}`, plugin.manifest.id),
    )
  }
  plugin.loaded = import(pathToFileURL(plugin.entryPath).href).catch(() => {
    plugin.status = "failed"
    plugin.diagnostics = ["plugin entry load failed"]
    throw new NexumPluginLoaderError(
      "plugin_load_failed",
      `Plugin 入口加载失败: ${plugin.manifest.id}`,
      plugin.manifest.id,
    )
  })
  return plugin.loaded
}

/**
 * 扫描一个 Plugin 根目录下的直接子目录。
 *
 * @param root - Plugin 根目录
 * @returns 合法 Plugin 候选
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function scanPluginRoot(root: string): Promise<NexumPluginSourceCandidate[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
  const candidates = await Promise.all(directories.map((entry) => scanPluginDirectory(join(root, entry.name))))
  return candidates.flatMap((item) => item ? [item] : [])
}

/**
 * 读取并校验单个 Plugin 目录的 Manifest，不读取或执行入口文件。
 *
 * @param directory - Plugin 目录
 * @returns 合法 Plugin 候选；无效输入返回 undefined
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function scanPluginDirectory(directory: string): Promise<NexumPluginSourceCandidate | undefined> {
  const document: unknown = await Bun.file(join(directory, pluginManifestFile)).json().catch(() => undefined)
  if (!isRecord(document) || !isSafeEntry(document.entry)) return undefined
  const manifestInput = { ...document }
  delete manifestInput.entry
  if (validateNexumPluginManifest(manifestInput).length > 0) return undefined
  return {
    address: directory,
    entryPath: resolve(directory, document.entry),
    manifest: manifestInput as unknown as NexumPluginManifest,
  }
}

/**
 * 创建安全的摘要快照。
 *
 * @param plugin - Plugin 内部记录
 * @returns 不包含入口路径和加载 Promise 的公开摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function createSummary(plugin: PluginRecord): NexumPluginSummary {
  return {
    ...plugin.manifest,
    status: plugin.status,
    diagnostics: [...plugin.diagnostics],
    routing: {
      intents: [...plugin.manifest.routing.intents],
      examples: [...plugin.manifest.routing.examples],
      keywords: [...plugin.manifest.routing.keywords],
    },
    exports: plugin.manifest.exports.map((item) => ({ ...item })),
    permissions: [...plugin.manifest.permissions],
  }
}

/**
 * 按 Plugin ID 稳定排序摘要。
 *
 * @param left - 左侧摘要
 * @param right - 右侧摘要
 * @returns 字典序比较结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function compareSummary(left: NexumPluginSummary, right: NexumPluginSummary): number {
  return left.id.localeCompare(right.id)
}

/**
 * 判断值是否为普通对象。
 *
 * @param input - 未知输入
 * @returns 是否为对象记录
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

/**
 * 校验入口路径只能指向 Plugin 目录内的相对文件。
 *
 * @param input - Manifest 的 entry 字段
 * @returns 是否为安全入口路径
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function isSafeEntry(input: unknown): input is string {
  if (
    typeof input !== "string" ||
    !input ||
    input.includes("\\") ||
    input.includes("\0") ||
    input.startsWith("/")
  ) return false
  return !input.split("/").includes("..")
}
