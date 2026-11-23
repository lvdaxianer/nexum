/**
 * 本地文件系统和 Shell Host Adapter。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import type { HostPort } from "@nexum/core"

export interface LocalHostOptions {
  readonly shell?: string
}

export function createLocalHostAdapter(options: LocalHostOptions = {}): HostPort {
  const shell = options.shell ?? "sh"
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
      if (input.signal?.aborted) return { ok: false, output: "shell 工具已取消" }
      try {
        const child = Bun.spawn([shell, "-lc", input.command], {
          cwd: input.directory,
          stdout: "pipe",
          stderr: "pipe",
        })
        const abort = () => child.kill()
        input.signal?.addEventListener("abort", abort, { once: true })
        const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
        const exitCode = await child.exited
        input.signal?.removeEventListener("abort", abort)
        return { ok: exitCode === 0, output: `${stdout}${stderr}`.trim() }
      } catch {
        return { ok: false, output: "shell 工具执行失败" }
      }
    },
  }
}

function resourcePath(directory: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const candidate = resolve(directory, value)
  const relativePath = relative(directory, candidate)
  if (isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${sep}`)) return undefined
  return candidate
}
