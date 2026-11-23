import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "bun:test"

const repositoryRoot = resolve(import.meta.dir, "../../..")

test("仓库 workspace 只暴露 Nexum 包", async () => {
  const rootPackage = await Bun.file(resolve(repositoryRoot, "package.json")).json()
  const workspaceDirectories = (await readdir(resolve(repositoryRoot, "packages"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("nexum-"))
    .sort()
  const workspacePackageNames = await Promise.all(
    workspaceDirectories.map(async (directory) =>
      (await Bun.file(resolve(repositoryRoot, "packages", directory, "package.json")).json()).name,
    ),
  )

  expect(rootPackage.name).toBe("nexum")
  expect(rootPackage.workspaces.packages).toEqual(["packages/nexum-*"])
  expect(workspacePackageNames.every((name) => name.startsWith("@nexum/"))).toBe(true)
  const legacyNamespace = ["@op", "encode/"].join("")
  expect(JSON.stringify(rootPackage)).not.toContain(legacyNamespace)
  expect(await Bun.file(resolve(repositoryRoot, "turbo.json")).text()).not.toContain(legacyNamespace)
})

test("仓库不保留旧 workspace 包目录", async () => {
  const oldPackageDirectories = [
    "ai",
    "app",
    "cli",
    "client",
    "codemode",
    "core",
    "data",
    "desktop",
    "effect-drizzle-sqlite",
    "gui-plugins",
    "http-recorder",
    "httpapi-codegen",
    "identity",
    "latex",
    "merman",
    "nav-menus",
    "patchmark",
    "plugin",
    "plugin-browser",
    "plugins",
    "process-daemon",
    "protocol",
    "schema",
    "script",
    "sdk",
    "server",
    "session-ui",
    "simulation",
    "stories",
    "theme",
    "tui",
    "ui",
    "util",
  ]

  const packageDirectories = new Set(await readdir(resolve(repositoryRoot, "packages")))
  expect(oldPackageDirectories.filter((directory) => packageDirectories.has(directory))).toEqual([])
  expect(await Bun.file(resolve(repositoryRoot, "strobe.json")).exists()).toBe(false)
  expect(await Bun.file(resolve(repositoryRoot, ".dockerignore")).text()).not.toContain(".opencode")
})
