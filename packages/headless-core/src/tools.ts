/**
 * Headless Core 的最小工具注册、资源归一化和执行适配。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { HeadlessSessionService, ToolPort, ToolRequest, ToolResult } from "./index.js"

/** POC 首期内置工具名称。 */
export type HeadlessBuiltinToolName = "read" | "write" | "edit" | "shell"

/** Headless 工具注册配置。 */
export interface HeadlessToolRegistryOptions {
  readonly sessions: HeadlessSessionService
}

/** 内置工具注册表和统一执行端口。 */
export interface HeadlessToolRegistry {
  readonly names: readonly HeadlessBuiltinToolName[]
  readonly port: ToolPort
}

/**
 * 将模型工具调用归一化为权限系统使用的 action/resource。
 *
 * @param sessionID - 目标 Session ID
 * @param toolName - 模型返回的工具名称
 * @param input - 模型返回的工具参数
 * @returns 带规范化权限字段的工具请求
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function normalizeHeadlessToolRequest(
  sessionID: string,
  toolName: string,
  input: Record<string, unknown>,
): ToolRequest {
  const action = toolName === "read" ? "read" : toolName === "write" || toolName === "edit" ? "write" : toolName
  const resource =
    toolName === "shell"
      ? typeof input.command === "string"
        ? input.command
        : "shell"
      : typeof input.path === "string"
        ? input.path
        : toolName
  return { sessionID, toolName, action, resource, input }
}

/**
 * 创建只依赖 Session Service 的最小内置工具注册表。
 *
 * @param options - Session 查询端口
 * @returns read、write/edit 和 shell 工具的统一执行端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessToolRegistry(options: HeadlessToolRegistryOptions): HeadlessToolRegistry {
  const names: readonly HeadlessBuiltinToolName[] = ["read", "write", "edit", "shell"]

  return {
    names,
    port: {
      execute: async (request) => {
        const session = await options.sessions.get(request.sessionID)
        if (!session) return { ok: false, output: "Session 不存在" }
        if (request.toolName === "read") return readTool(session.directory, request)
        if (request.toolName === "write" || request.toolName === "edit") return writeTool(session.directory, request)
        if (request.toolName === "shell") return shellTool(session.directory, request)
        return { ok: false, output: "工具未注册" }
      },
    },
  }
}

async function readTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  const path = resourcePath(directory, request.input.path)
  if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
  if (typeof request.input.path !== "string") return { ok: false, output: "read 工具缺少 path" }
  try {
    return { ok: true, output: await readFile(path, "utf8") }
  } catch {
    return { ok: false, output: "read 工具执行失败" }
  }
}

async function writeTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  const path = resourcePath(directory, request.input.path)
  if (!path) return { ok: false, output: "工具资源必须位于 Session 工作目录内" }
  if (typeof request.input.path !== "string") return { ok: false, output: "write 工具缺少 path" }
  if (typeof request.input.content !== "string") return { ok: false, output: "write 工具缺少 content" }
  try {
    await mkdir(resolve(path, ".."), { recursive: true })
    await writeFile(path, request.input.content, "utf8")
    return { ok: true, output: "" }
  } catch {
    return { ok: false, output: "write 工具执行失败" }
  }
}

async function shellTool(directory: string, request: ToolRequest): Promise<ToolResult> {
  if (typeof request.input.command !== "string" || !request.input.command.trim()) {
    return { ok: false, output: "shell 工具缺少 command" }
  }
  try {
    const child = Bun.spawn(["sh", "-lc", request.input.command], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    const exitCode = await child.exited
    return { ok: exitCode === 0, output: `${stdout}${stderr}`.trim() }
  } catch {
    return { ok: false, output: "shell 工具执行失败" }
  }
}

function resourcePath(directory: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const candidate = resolve(directory, value)
  const relativePath = relative(directory, candidate)
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return undefined
  return candidate
}
