/**
 * 本地文件系统和 Shell Host Adapter。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { HostPort, ToolResult } from "@nexum/core"

export interface LocalHostOptions {
  readonly shell?: string
  readonly timeoutMs?: number
  readonly cleanupTimeoutMs?: number
}

export function createLocalHostAdapter(options: LocalHostOptions = {}): HostPort {
  const shell = options.shell ?? "sh"
  const timeoutMs = options.timeoutMs === 0 ? undefined : normalizeTimeout(options.timeoutMs) ?? DEFAULT_SHELL_TIMEOUT_MS
  const cleanupTimeoutMs = normalizeTimeout(options.cleanupTimeoutMs) ?? DEFAULT_SHELL_CLEANUP_TIMEOUT_MS
  return {
    async readText(input) {
      const path = resourcePath(input.directory, input.path)
      if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
      try {
        return { ok: true, output: await readFile(path, "utf8") }
      } catch {
        return { ok: false, output: "read 工具执行失败" }
      }
    },
    async writeText(input) {
      const path = resourcePath(input.directory, input.path)
      if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
      if (typeof input.content !== "string") return { ok: false, output: "write 工具缺少 content" }
      try {
        await mkdir(resolve(path, ".."), { recursive: true })
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
      return runShellProcess(child, input.signal, timeoutMs, cleanupTimeoutMs)
    },
  }
}

const DEFAULT_SHELL_TIMEOUT_MS = 120_000
const DEFAULT_SHELL_CLEANUP_TIMEOUT_MS = 250
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
async function runShellProcess(child: Bun.ReadableSubprocess, signal: AbortSignal | undefined, timeoutMs: number | undefined, cleanupTimeoutMs: number): Promise<ToolResult> {
  const stdout = captureOutput(child.stdout)
  const stderr = captureOutput(child.stderr)
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
function captureOutput(stream: ReadableStream<Uint8Array>): CapturedOutput {
  let output = ""
  const promise = (async () => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return `${output}${decoder.decode()}`
      output += decoder.decode(chunk.value, { stream: true })
    }
  })()
  return { promise, value: () => output }
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

function resourcePath(directory: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const candidate = resolve(directory, value)
  const relativePath = relative(directory, candidate)
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return undefined
  return candidate
}
