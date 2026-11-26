/** 可注入的 Host 沙箱装饰器，不依赖 Docker 或其他外部运行时。 */

import type { HostPort, ToolResult } from "@nexum/core"

export interface NexumSandboxOptions {
  readonly allowedActions?: readonly ("read" | "write" | "shell")[]
  readonly maxOutputBytes?: number
}

const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576
const OUTPUT_TRUNCATED_SUFFIX = "\n[输出已截断]"

export function createSandboxHost(host: HostPort, options: NexumSandboxOptions = {}): HostPort {
  const allowedActions = new Set(options.allowedActions ?? ["read", "write", "shell"])
  const maxOutputBytes = normalizeLimit(options.maxOutputBytes) ?? DEFAULT_MAX_OUTPUT_BYTES
  return {
    readText(input) {
      if (!allowedActions.has("read")) return Promise.resolve(deniedResult("read"))
      return host.readText(input).then((result) => boundResult(result, maxOutputBytes))
    },
    writeText(input) {
      if (!allowedActions.has("write")) return Promise.resolve(deniedResult("write"))
      return host.writeText(input).then((result) => boundResult(result, maxOutputBytes))
    },
    runShell(input) {
      if (!allowedActions.has("shell")) return Promise.resolve(deniedResult("shell"))
      return host.runShell(input).then((result) => boundResult(result, maxOutputBytes))
    },
  }
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.floor(value))
}

function deniedResult(action: string): ToolResult {
  return { ok: false, output: `Sandbox 禁止执行 ${action} 操作` }
}

function boundResult(result: ToolResult, maxOutputBytes: number): ToolResult {
  if (Buffer.byteLength(result.output, "utf8") <= maxOutputBytes) return result
  const suffixBytes = Buffer.byteLength(OUTPUT_TRUNCATED_SUFFIX, "utf8")
  const contentBytes = Math.max(0, maxOutputBytes - suffixBytes)
  const content = Buffer.from(result.output, "utf8").subarray(0, contentBytes).toString("utf8")
  return { ...result, output: `${content}${OUTPUT_TRUNCATED_SUFFIX}` }
}
