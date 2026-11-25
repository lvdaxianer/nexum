import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createEmbeddedRuntime, createNexumPluginRegistry, createNexumPluginRuntime } from "../src/index.ts"
import type { NexumPluginManifest } from "@nexum/core"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const manifest: NexumPluginManifest = {
  id: "crm",
  version: "1.0.0",
  description: "处理客户和订单问题",
  routing: { intents: ["order"], examples: ["查询订单"], keywords: ["订单"] },
  exports: [{ id: "order.query", kind: "function", description: "查询订单" }],
  permissions: ["order.read"],
}

test("mounts a plugin only in the requesting session and unmounts its capabilities", async () => {
  const fixture = await createMountFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const runtime = createNexumPluginRuntime({ registry })

  await expect(runtime.listActive("session-2")).resolves.toEqual([])
  await runtime.activate({ sessionID: "session-1", pluginID: "crm", source: "explicit" })
  await expect(runtime.listActive("session-1")).resolves.toMatchObject([
    { pluginID: "crm", capabilities: ["order.query"] },
  ])
  await expect(runtime.listActive("session-2")).resolves.toEqual([])
  await runtime.deactivate({ sessionID: "session-1", pluginID: "crm" })
  await expect(runtime.listActive("session-1")).resolves.toEqual([])
  await expect(Bun.file(fixture.marker).text()).resolves.toBe(
    "mounted:session-1\nunmounted:session-1\n",
  )
})

test("does not keep a failed mount in the active scope", async () => {
  const fixture = await createMountFixture("throw new Error(\"mount failed\")")
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const runtime = createNexumPluginRuntime({ registry })

  await expect(
    runtime.activate({ sessionID: "session-1", pluginID: "crm", source: "automatic" }),
  ).rejects.toMatchObject({ code: "plugin_mount_failed", pluginID: "crm" })
  await expect(runtime.listActive("session-1")).resolves.toEqual([])
  await expect(runtime.listDiagnostics()).resolves.toMatchObject([
    { code: "plugin_mount_failed", pluginID: "crm" },
  ])
})

test("closes mounted plugins with the embedded runtime", async () => {
  const fixture = await createMountFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const runtime = createEmbeddedRuntime({ pluginRegistry: registry })

  await runtime.pluginInvocation.resolve({ sessionID: "session-1", text: "@crm 查询订单" })
  await runtime.close()

  await expect(runtime.pluginRuntime.listActive("session-1")).resolves.toEqual([])
  await expect(Bun.file(fixture.marker).text()).resolves.toBe(
    "mounted:session-1\nunmounted:session-1\n",
  )
})

async function createMountFixture(prefix = "") {
  const root = await mkdtemp(join(tmpdir(), "nexum-plugin-runtime-"))
  directories.push(root)
  const entry = join(root, "index.ts")
  const marker = join(root, "lifecycle.log")
  await writeFile(entry, `${prefix}\n${mountSource(marker)}`)
  await mkdir(join(root, "empty"))
  return { root, entry, marker }
}

function mountSource(marker: string): string {
  return `export default {
  async mount(context) {
    await Bun.write(${JSON.stringify(marker)}, \`mounted:\${context.sessionID}\\n\`)
    return {
      capabilities: ["order.query"],
      async unmount() {
        await Bun.write(
          ${JSON.stringify(marker)},
          (await Bun.file(${JSON.stringify(marker)}).text()) + \`unmounted:\${context.sessionID}\\n\`,
        )
      },
    }
  },
}`
}
