import { expect, test } from "bun:test"
import { join } from "node:path"

const FORBIDDEN_UI_PACKAGES = ["@opencode/app", "@opencode/tui", "@opencode/desktop", "@opencode/cli"]
const FORBIDDEN_IMPORTS = ["node:fs", "node:fs/promises", "node:child_process", "node:http", "node:net"]
const FORBIDDEN_EXPORTS = ["createFile", "createInMemory", "createOpenAICompatible", "createLocal"]

test("nexum-core exports a UI-independent composition entry", async () => {
  const packageModule = await import("../src/index.ts")
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(packageModule.createNexumCore).toBeFunction()
  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})

test("nexum-core does not import infrastructure or export default adapters", async () => {
  const sourceDirectory = join(import.meta.dir, "../src")
  const sourceFiles = await Array.fromAsync(new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: sourceDirectory }))
  const imports = sourceFiles.flatMap((file) => {
    const source = Bun.file(join(sourceDirectory, file))
    return source.text().then((text) => FORBIDDEN_IMPORTS.filter((item) => text.includes(`\"${item}\"`)).map((item) => `${file}: ${item}`))
  })
  const violations = (await Promise.all(imports)).flat()
  expect(violations).toEqual([])

  const packageModule = await import("../src/index.ts")
  const concreteExports = Object.keys(packageModule).filter((name) => FORBIDDEN_EXPORTS.some((prefix) => name.startsWith(prefix)))
  expect(concreteExports).toEqual([])
})
