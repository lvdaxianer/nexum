import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLocalHostAdapter } from "../src/local-host.ts"

async function directory() {
  return mkdtemp(join(tmpdir(), "nexum-local-host-"))
}

test("settles a shell command that keeps output pipes open after timeout", async () => {
  const workingDirectory = await directory()
  const host = createLocalHostAdapter({ timeoutMs: 20, cleanupTimeoutMs: 20 })
  const startedAt = Date.now()

  const result = await host.runShell({ directory: workingDirectory, command: "printf before; sleep 30 & wait" })

  expect(Date.now() - startedAt).toBeLessThan(500)
  expect(result).toMatchObject({ ok: false, errorCode: "timeout", status: "timeout", output: "before" })
  await rm(workingDirectory, { recursive: true, force: true })
})

test("terminates a shell command when its signal is aborted", async () => {
  const workingDirectory = await directory()
  const host = createLocalHostAdapter({ timeoutMs: 5_000, cleanupTimeoutMs: 20 })
  const controller = new AbortController()
  const running = host.runShell({ directory: workingDirectory, command: "sleep 30 & wait", signal: controller.signal })

  await new Promise((resolve) => setTimeout(resolve, 20))
  controller.abort()
  const result = await running

  expect(result).toMatchObject({ ok: false, errorCode: "cancelled", status: "cancelled" })
  await rm(workingDirectory, { recursive: true, force: true })
})

test("returns output and exit status for a completed shell command", async () => {
  const workingDirectory = await directory()
  const host = createLocalHostAdapter({ timeoutMs: 1_000 })

  const result = await host.runShell({ directory: workingDirectory, command: "printf output; exit 7" })

  expect(result).toEqual({ ok: false, output: "output" })
  await rm(workingDirectory, { recursive: true, force: true })
})

test("bounds shell output and file reads and writes", async () => {
  const workingDirectory = await directory()
  const host = createLocalHostAdapter({ maxOutputBytes: 4, maxReadBytes: 4, maxWriteBytes: 4 })
  await writeFile(join(workingDirectory, "large.txt"), "12345", "utf8")

  const shell = await host.runShell({ directory: workingDirectory, command: "printf 123456" })
  const read = await host.readText({ directory: workingDirectory, path: "large.txt" })
  const write = await host.writeText({ directory: workingDirectory, path: "too-large.txt", content: "12345" })

  expect(shell).toMatchObject({ ok: true })
  expect(shell.output).toContain("1234")
  expect(shell.output).toContain("输出已截断")
  expect(read).toEqual({ ok: false, output: "read 工具输出超过大小限制" })
  expect(write).toEqual({ ok: false, output: "write 工具输入超过大小限制" })
  await rm(workingDirectory, { recursive: true, force: true })
})

test("rejects symlinks that resolve outside the session directory", async () => {
  const workingDirectory = await directory()
  const outsideDirectory = await directory()
  const outsideFile = join(outsideDirectory, "secret.txt")
  const linkedFile = join(workingDirectory, "linked.txt")
  await writeFile(outsideFile, "secret", "utf8")
  await symlink(outsideFile, linkedFile)
  const host = createLocalHostAdapter()

  const read = await host.readText({ directory: workingDirectory, path: "linked.txt" })
  const write = await host.writeText({ directory: workingDirectory, path: "linked.txt", content: "changed" })

  expect(read).toEqual({ ok: false, output: "工具资源必须位于 Session 工作目录内" })
  expect(write).toEqual({ ok: false, output: "工具资源必须位于 Session 工作目录内" })
  expect(await readFile(outsideFile, "utf8")).toBe("secret")
  await rm(workingDirectory, { recursive: true, force: true })
  await rm(outsideDirectory, { recursive: true, force: true })
})
