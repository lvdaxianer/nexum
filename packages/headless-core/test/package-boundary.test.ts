import { expect, test } from "bun:test"

const FORBIDDEN_UI_PACKAGES = ["@opencode/app", "@opencode/tui", "@opencode/desktop", "@opencode/cli"]

test("headless-core exports a UI-independent composition entry", async () => {
  const packageModule = await import("../src/index.ts")
  const manifest = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

  expect(packageModule.createHeadlessCore).toBeFunction()
  expect(dependencies).not.toEqual(expect.arrayContaining(FORBIDDEN_UI_PACKAGES))
})
