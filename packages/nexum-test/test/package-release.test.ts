import { test, expect } from "bun:test"
import { resolve } from "node:path"

test("release builder generates the nexum-ai beta package identity", () => {
  const root = resolve(import.meta.dir, "../../..")
  const result = Bun.spawnSync(["bun", "run", "build:packages"], { cwd: root, stdout: "pipe", stderr: "pipe" })
  expect(result.exitCode).toBe(0)
  expect(Bun.file(resolve(root, "artifacts/nexum/package.json")).json()).resolves.toMatchObject({
    name: "nexum-ai",
    version: "0.1.0-beta.0",
  })
})
