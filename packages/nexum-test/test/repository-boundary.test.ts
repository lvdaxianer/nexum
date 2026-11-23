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

test("运行时包按职责保持单向依赖", async () => {
  const readManifest = async (directory: string) =>
    (await Bun.file(resolve(repositoryRoot, "packages", directory, "package.json")).json()) as {
      dependencies?: Record<string, string>
    }
  const core = await readManifest("nexum-core")
  const persistence = await readManifest("nexum-persistence")
  const integrations = await readManifest("nexum-integrations")
  const application = await readManifest("nexum-application")

  expect(core.dependencies ?? {}).not.toHaveProperty("@nexum/persistence")
  expect(core.dependencies ?? {}).not.toHaveProperty("@nexum/integrations")
  expect(core.dependencies ?? {}).not.toHaveProperty("@nexum/application")
  expect(persistence.dependencies).toEqual({ "@nexum/core": "workspace:*" })
  expect(integrations.dependencies).toEqual({ "@nexum/core": "workspace:*" })
  expect(application.dependencies).toEqual({
    "@nexum/core": "workspace:*",
    "@nexum/integrations": "workspace:*",
    "@nexum/persistence": "workspace:*",
  })
})

test("活动代码不再引用旧的聚合适配器包", async () => {
  const files = await Array.fromAsync(
    new Bun.Glob("{packages,README.md,CONTRIBUTING.md,package.json,bun.lock}/**/*.{ts,tsx,json,md,lock}").scan({
      cwd: repositoryRoot,
      onlyFiles: true,
    }),
  )
  const references = await Promise.all(
    files.map(async (file) => {
      const content = await Bun.file(resolve(repositoryRoot, file)).text()
      const legacyPackage = `@nexum/${"adapters"}`
      const legacyDirectory = `nexum-${"adapters"}`
      return content.includes(legacyPackage) || content.includes(legacyDirectory) ? file : undefined
    }),
  )
  expect(references.filter((file): file is string => file !== undefined)).toEqual([])
})
