/**
 * Nexum Host 能力端口。
 *
 * 文件系统、Shell 和进程边界由 Host Adapter 提供，Core 只依赖这些稳定契约。
 */

import type { ToolResult } from "./index.js"

export interface HostReadInput {
  readonly directory: string
  readonly path: unknown
}

export interface HostWriteInput {
  readonly directory: string
  readonly path: unknown
  readonly content: unknown
}

export interface HostShellInput {
  readonly directory: string
  readonly command: unknown
  readonly signal?: AbortSignal
}

export interface HostPort {
  readonly readText: (input: HostReadInput) => Promise<ToolResult>
  readonly writeText: (input: HostWriteInput) => Promise<ToolResult>
  readonly runShell: (input: HostShellInput) => Promise<ToolResult>
}
