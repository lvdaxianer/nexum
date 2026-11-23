/** Nexum Core 的工具端口与权限请求归一化。 */

import type { ModelToolDefinition, NexumSessionService, ToolPort, ToolRequest } from "./index.js"
import type { HostPort } from "./host.js"

/** POC 首期内置工具名称。 */
export type NexumBuiltinToolName = "read" | "write" | "edit" | "shell" | "skill_registry"

/** 工具注册配置。 */
export interface NexumToolRegistryOptions {
  readonly sessions: NexumSessionService
  readonly host?: HostPort
}

/** 工具注册表的语义视图。 */
export interface NexumToolRegistry {
  readonly names: readonly NexumBuiltinToolName[]
  readonly definitions: readonly ModelToolDefinition[]
  readonly port: ToolPort
}

/** 将模型工具调用归一化为权限系统使用的 action/resource。 */
export function normalizeNexumToolRequest(
  sessionID: string,
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): ToolRequest {
  const action = toolName === "read"
    ? "read"
    : toolName === "write" || toolName === "edit"
      ? "write"
      : toolName === "skill_registry"
        ? skillRegistryPermissionAction(input.operation)
        : toolName
  const resource =
    toolName === "shell"
      ? typeof input.command === "string"
        ? input.command
        : "shell"
      : toolName === "skill_registry"
        ? typeof input.address === "string"
          ? input.address
          : typeof input.id === "string"
            ? input.id
            : "skills"
      : typeof input.path === "string"
        ? input.path
        : toolName
  return { sessionID, toolName, action, resource, input, ...(signal ? { signal } : {}) }
}

function skillRegistryPermissionAction(operation: unknown): "skill.manage" | "skill.read" {
  return operation === "register" || operation === "refresh" || operation === "unregister" ? "skill.manage" : "skill.read"
}
