import { afterEach, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createNexumPluginRegistry } from "../src/index.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("discovers plugin summaries without executing the entry module", async () => {
  const root = await createPluginFixture("crm", `export default { id: "crm" }`)
  const registry = createNexumPluginRegistry({ roots: [root.parent] })

  await expect(registry.list()).resolves.toMatchObject([{ id: "crm", status: "registered" }])
  await expect(access(root.marker)).rejects.toThrow()

  const plugin = await registry.get("crm")
  expect(plugin?.manifest.id).toBe("crm")
  await plugin?.load()
  await expect(Bun.file(root.marker).text()).resolves.toBe("loaded")
})

test("does not register a plugin with an invalid manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "nexum-plugin-invalid-"))
  directories.push(root)
  await mkdir(join(root, "broken"))
  await writeFile(join(root, "broken", "plugin.json"), JSON.stringify({ id: "broken", entry: "./index.ts" }))

  const registry = createNexumPluginRegistry({ roots: [root] })

  await expect(registry.list()).resolves.toEqual([])
})

test("records a stable failure when lazy loading the entry module fails", async () => {
  const root = await createPluginFixture("crm", `throw new Error("entry failed")`)
  const registry = createNexumPluginRegistry({ roots: [root.parent] })
  const plugin = await registry.get("crm")

  await expect(plugin?.load()).rejects.toThrow("Plugin 入口加载失败: crm")
  await expect(registry.list()).resolves.toMatchObject([
    { id: "crm", status: "failed", diagnostics: ["plugin entry load failed"] },
  ])
})

async function createPluginFixture(id: string, entry: string): Promise<{ parent: string; marker: string }> {
  const parent = await mkdtemp(join(tmpdir(), "nexum-plugin-"))
  directories.push(parent)
  const pluginRoot = join(parent, id)
  const marker = join(parent, "entry-loaded")
  await mkdir(pluginRoot)
  await writeFile(
    join(pluginRoot, "plugin.json"),
    JSON.stringify({
      id,
      version: "1.0.0",
      description: "处理客户和订单问题",
      routing: { intents: ["order"], examples: ["查询订单"], keywords: ["订单"] },
      exports: [{ id: "order.query", kind: "function", description: "查询订单" }],
      permissions: ["order.read"],
      entry: "./index.ts",
    }),
  )
  await writeFile(join(pluginRoot, "index.ts"), `${entry}\nawait Bun.write(${JSON.stringify(marker)}, "loaded")`)
  return { parent, marker }
}
