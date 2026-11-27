import { test, expect } from "bun:test"
import { resolve } from "node:path"

test("release preparation creates a parameterized tarball without publishing", async () => {
  const root = resolve(import.meta.dir, "../../..")
  const result = Bun.spawnSync(
    ["bun", "run", "release:nexum:prepare", "--version", "0.1.0-beta.1", "--tag", "beta"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const output = `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`

  expect(result.exitCode).toBe(0)
  expect(output).toContain("Release preparation passed")
  expect(output).toContain("npm publish")
  expect(await Bun.file(resolve(root, "artifacts/nexum/package.json")).json()).toMatchObject({
    name: "nexum-ai",
    version: "0.1.0-beta.1",
    publishConfig: { tag: "beta" },
    bin: { nexum: "dist/cli.js" },
  })
  expect(await Bun.file(resolve(root, "artifacts/nexum/nexum-ai-0.1.0-beta.1.tgz")).exists()).toBe(true)
}, 120_000)

test("release preparation rejects invalid version input", () => {
  const root = resolve(import.meta.dir, "../../..")
  const result = Bun.spawnSync(
    ["bun", "run", "release:nexum:prepare", "--version", "not-a-version", "--tag", "beta"],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const output = `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`

  expect(result.exitCode).not.toBe(0)
  expect(output).toContain("不是合法的 semver")
})
