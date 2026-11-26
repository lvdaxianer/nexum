import { expect, test } from "bun:test"
import { createSandboxHost } from "../src/sandbox.ts"

test("denies disallowed Host actions without invoking the underlying adapter", async () => {
  let shellCalls = 0
  const host = createSandboxHost(
    {
      async readText() { return { ok: true, output: "read" } },
      async writeText() { return { ok: true, output: "write" } },
      async runShell() {
        shellCalls += 1
        return { ok: true, output: "shell" }
      },
    },
    { allowedActions: ["read"] },
  )

  await expect(host.runShell({ directory: "/tmp", command: "echo blocked" })).resolves.toEqual({
    ok: false,
    output: "Sandbox 禁止执行 shell 操作",
  })
  expect(shellCalls).toBe(0)
})

test("bounds Host output while preserving execution status", async () => {
  const host = createSandboxHost(
    {
      async readText() { return { ok: false, output: "012345678901234567890123456789", status: "failed" } },
      async writeText() { return { ok: true, output: "" } },
      async runShell() { return { ok: true, output: "" } },
    },
    { maxOutputBytes: 20 },
  )

  const result = await host.readText({ directory: "/tmp", path: "output.txt" })
  expect(result.ok).toBe(false)
  expect(result.status).toBe("failed")
  expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(20)
  expect(result.output).toContain("输出已截断")
})
