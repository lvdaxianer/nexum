/**
 * Nexum Host 能力端口。
 *
 * 文件系统、Shell 和进程边界由 Host Adapter 提供，Core 只依赖这些稳定契约。
 */

import type { ToolResult } from "./index.js"

export type NexumHostRisk = "filesystem" | "shell" | "network" | "credential" | "unknown"

export interface NexumHostResourceDescriptor {
  readonly action: string
  readonly resource: string
  readonly risk: NexumHostRisk
}

const networkCommandPattern = /\b(?:curl|wget|nc|netcat|ssh|scp|sftp|ftp|git\s+(?:clone|fetch|push))\b/i
const credentialPattern = /(?:authorization|api[_-]?key|access[_-]?token|bearer|password|secret|credential)\s*[:=]/i

/** 生成供 Permission 和审计使用的稳定 Host 资源描述。 */
export function normalizeNexumHostResource(action: string, value: unknown): NexumHostResourceDescriptor {
  const resource = typeof value === "string" ? value.trim().replaceAll("\\", "/") : ""
  const normalizedAction = action.trim().toLowerCase()
  const risk = classifyHostRisk(normalizedAction, resource)
  return { action: normalizedAction, resource, risk }
}

function classifyHostRisk(action: string, resource: string): NexumHostRisk {
  if (action === "read" || action === "write" || action === "edit") return "filesystem"
  if (action === "network") return "network"
  if (action === "shell") {
    if (credentialPattern.test(resource)) return "credential"
    if (networkCommandPattern.test(resource)) return "network"
    return "shell"
  }
  return "unknown"
}

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
