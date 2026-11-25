/**
 * 本地文件系统和 Shell Host Adapter。
 */

import { mkdir, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import type { HostPort, ToolResult } from "@nexum/core"

export interface LocalHostOptions {
  readonly shell?: string
  readonly timeoutMs?: number
  readonly cleanupTimeoutMs?: number
  readonly maxReadBytes?: number
  readonly maxWriteBytes?: number
  readonly maxOutputBytes?: number
}

export function createLocalHostAdapter(options: LocalHostOptions = {}): HostPort {
  const shell = options.shell ?? "sh"
  const timeoutMs = options.timeoutMs === 0 ? undefined : normalizeTimeout(options.timeoutMs) ?? DEFAULT_SHELL_TIMEOUT_MS
  const cleanupTimeoutMs = normalizeTimeout(options.cleanupTimeoutMs) ?? DEFAULT_SHELL_CLEANUP_TIMEOUT_MS
  const maxReadBytes = normalizeLimit(options.maxReadBytes) ?? DEFAULT_MAX_READ_BYTES
  const maxWriteBytes = normalizeLimit(options.maxWriteBytes) ?? DEFAULT_MAX_WRITE_BYTES
  const maxOutputBytes = normalizeLimit(options.maxOutputBytes) ?? DEFAULT_MAX_OUTPUT_BYTES
  return {
    async readText(input) {
      const path = await resourcePath(input.directory, input.path)
      if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
      try {
        const output = await readText(path, maxReadBytes)
        return output === undefined ? { ok: false, output: "read 工具输出超过大小限制" } : { ok: true, output }
      } catch {
        return { ok: false, output: "read 工具执行失败" }
      }
    },
    async writeText(input) {
      const path = await resourcePath(input.directory, input.path)
      if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
      if (typeof input.content !== "string") return { ok: false, output: "write 工具缺少 content" }
      if (Buffer.byteLength(input.content, "utf8") > maxWriteBytes) return { ok: false, output: "write 工具输入超过大小限制" }
      try {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, input.content, "utf8")
        return { ok: true, output: "" }
      } catch {
        return { ok: false, output: "write 工具执行失败" }
      }
    },
    async runShell(input) {
      if (typeof input.command !== "string" || !input.command.trim()) return { ok: false, output: "shell 工具缺少 command" }
      if (input.signal?.aborted) return { ok: false, output: "shell 工具已取消", errorCode: "cancelled", status: "cancelled" }
      const child = Bun.spawn([shell, "-lc", input.command], {
        cwd: input.directory,
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      })
      return runShellProcess(child, input.signal, timeoutMs, cleanupTimeoutMs, maxOutputBytes)
    },
  }
}

const DEFAULT_SHELL_TIMEOUT_MS = 120_000
const DEFAULT_SHELL_CLEANUP_TIMEOUT_MS = 250
const DEFAULT_MAX_READ_BYTES = 1_048_576
const DEFAULT_MAX_WRITE_BYTES = 4_194_304
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576
const OUTPUT_TRUNCATED_SUFFIX = "\n[输出已截断]"
type ShellTermination = "timeout" | "cancelled"
type ShellOutcome = { readonly type: "exit"; readonly exitCode: number } | { readonly type: ShellTermination }
type CapturedOutput = { readonly promise: Promise<string>; readonly value: () => string }

/**
 * 归一化 Shell 的可选时限。
 *
 * @param value - 原始毫秒值
 * @returns 正整数毫秒或未启用
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function normalizeTimeout(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.floor(value))
}

/**
 * 归一化文件和输出的大小上限。
 *
 * @param value - 原始字节数
 * @returns 正整数上限或未启用
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function normalizeLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.floor(value))
}

/**
 * 等待 Shell 正常退出、超时或外部取消。
 *
 * @param child - 已启动的 Shell 子进程
 * @param signal - 外部取消信号
 * @param timeoutMs - 总执行时限
 * @returns Shell 的生命周期结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function waitForShellOutcome(child: Bun.ReadableSubprocess, signal: AbortSignal | undefined, timeoutMs: number | undefined): Promise<ShellOutcome> {
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  const termination = new Promise<ShellTermination>((resolve) => {
    let settled = false
    const settle = (reason: ShellTermination) => {
      if (settled) return
      settled = true
      resolve(reason)
    }
    timeoutTimer = timeoutMs === undefined ? undefined : setTimeout(() => settle("timeout"), timeoutMs)
    abort = () => settle("cancelled")
    signal?.addEventListener("abort", abort, { once: true })
  })
  const outcome = await Promise.race([
    child.exited.then((exitCode) => ({ type: "exit" as const, exitCode })),
    termination.then((type) => ({ type })),
  ])
  if (timeoutTimer) clearTimeout(timeoutTimer)
  if (abort) signal?.removeEventListener("abort", abort)
  return outcome
}

/**
 * 结算 Shell 的输出、终止和最终工具结果。
 *
 * @param child - 已启动的 Shell 子进程
 * @param signal - 外部取消信号
 * @param timeoutMs - 总执行时限
 * @param cleanupTimeoutMs - 进程清理时限
 * @returns 工具执行结果
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function runShellProcess(
  child: Bun.ReadableSubprocess,
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
  cleanupTimeoutMs: number,
  maxOutputBytes: number,
): Promise<ToolResult> {
  const stdout = captureOutput(child.stdout, maxOutputBytes)
  const stderr = captureOutput(child.stderr, maxOutputBytes)
  const outcome = await waitForShellOutcome(child, signal, timeoutMs)
  if (outcome.type === "exit") return { ok: outcome.exitCode === 0, output: await readOutput(stdout, stderr, cleanupTimeoutMs) }
  signalProcess(child, "SIGTERM")
  await Promise.race([child.exited, delay(cleanupTimeoutMs)])
  signalProcess(child, "SIGKILL")
  return { ok: false, output: await readOutput(stdout, stderr, cleanupTimeoutMs), errorCode: outcome.type, status: outcome.type }
}

/**
 * 向独立 Shell 进程组发送信号，失败时回退到直接子进程。
 *
 * @param child - Shell 子进程
 * @param signal - 终止信号
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function signalProcess(child: Bun.ReadableSubprocess, signal: "SIGTERM" | "SIGKILL"): void {
  try {
    process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

/**
 * 在清理时限内读取 stdout 和 stderr，避免后台进程持有管道导致无限等待。
 *
 * @param stdout - stdout 读取 Promise
 * @param stderr - stderr 读取 Promise
 * @param timeoutMs - 读取兜底时限
 * @returns 合并并裁剪后的输出
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
async function readOutput(stdout: CapturedOutput, stderr: CapturedOutput, timeoutMs: number): Promise<string> {
  const result = await Promise.race([
    Promise.all([stdout.promise, stderr.promise]),
    delay(timeoutMs),
  ])
  return result instanceof Array ? `${result[0]}${result[1]}`.trim() : `${stdout.value()}${stderr.value()}`.trim()
}

/**
 * 增量捕获输出，保证清理超时时仍可返回已经读取的内容。
 *
 * @param stream - 子进程输出流
 * @returns 可等待且可读取当前内容的输出捕获器
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function captureOutput(stream: ReadableStream<Uint8Array>, maxBytes: number): CapturedOutput {
  const chunks: string[] = []
  let outputBytes = 0
  let truncated = false
  const promise = (async () => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        if (!truncated) chunks.push(decoder.decode())
        return formatCapturedOutput(chunks, truncated)
      }
      if (outputBytes >= maxBytes) {
        truncated = true
        continue
      }
      const remaining = maxBytes - outputBytes
      if (chunk.value.byteLength > remaining) {
        chunks.push(decoder.decode(chunk.value.slice(0, remaining)))
        outputBytes = maxBytes
        truncated = true
        continue
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }))
      outputBytes += chunk.value.byteLength
    }
  })()
  return { promise, value: () => formatCapturedOutput(chunks, truncated) }
}

/** 格式化有限输出，并明确告知调用方内容已经被裁剪。 */
function formatCapturedOutput(chunks: readonly string[], truncated: boolean): string {
  return `${chunks.join("")}${truncated ? OUTPUT_TRUNCATED_SUFFIX : ""}`
}

/**
 * 创建不会阻塞调用方的短暂等待。
 *
 * @param timeoutMs - 等待毫秒数
 * @returns 等待完成 Promise
 * @author lvdaxianer@yeah.net
 * @date 2026-11-25
 */
function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs))
}

async function resourcePath(directory: string, value: unknown): Promise<string | undefined> {
  if (typeof value !== "string" || !value.trim()) return undefined
  const root = await realpath(directory).catch(() => undefined)
  if (!root) return undefined
  const candidate = resolve(root, value)
  if (!isWithin(root, candidate)) return undefined
  const resolvedCandidate = await realpath(candidate).catch(() => undefined)
  if (resolvedCandidate) return isWithin(root, resolvedCandidate) ? resolvedCandidate : undefined
  const existingParent = await nearestExistingPath(dirname(candidate))
  return existingParent && isWithin(root, existingParent) ? candidate : undefined
}

/** 查找路径上最近的真实目录，用于校验尚未创建的写入目标。 */
async function nearestExistingPath(path: string): Promise<string | undefined> {
  let current = path
  while (true) {
    const resolvedPath = await realpath(current).catch(() => undefined)
    if (resolvedPath) return resolvedPath
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/** 判断路径是否位于真实工作目录内。 */
function isWithin(root: string, path: string): boolean {
  const relativePath = relative(root, path)
  return !isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith("..")
}

/** 在读取过程中限制文件大小，避免一次性加载无界内容。 */
async function readText(path: string, maxBytes: number): Promise<string | undefined> {
  const info = await stat(path)
  if (!info.isFile() || info.size > maxBytes) return undefined
  const chunks: string[] = []
  let totalBytes = 0
  const reader = Bun.file(path).stream().getReader()
  const decoder = new TextDecoder()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      chunks.push(decoder.decode())
      return chunks.join("")
    }
    totalBytes += chunk.value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      return undefined
    }
    chunks.push(decoder.decode(chunk.value, { stream: true }))
  }
}
