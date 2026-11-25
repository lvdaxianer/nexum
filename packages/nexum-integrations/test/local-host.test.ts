import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
