import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test("公共入口可以编译成浏览器 ESM 组件", async () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "nexum-surfaces-public-entry-"))
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "../src/index.ts")],
    outdir: outputDirectory,
    target: "browser",
    format: "esm",
    packages: "bundle",
    sourcemap: "none",
  })
  expect(result.success).toBe(true)
  if (!result.success) return
  const entry = result.outputs[0]
  expect(entry).toBeDefined()
  if (!entry) return
  const module = await import(entry.path)
  expect(module.NexumSurfaces).toBeFunction()
  rmSync(outputDirectory, { recursive: true, force: true })
})
