import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createEmbeddedRuntime, createNexumPluginRegistry, createNexumPluginRuntime } from "../src/index.ts"
import type { ModelPort, NexumPluginManifest, ToolRequest } from "@nexum/core"

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

test("routes a unique natural-language request through the same activation port", async () => {
  const fixture = await createMountFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const runtime = createEmbeddedRuntime({ pluginRegistry: registry })

  await expect(runtime.pluginInvocation.resolve({ sessionID: "session-1", text: "请查询订单" })).resolves.toEqual([
    { pluginID: "crm", status: "active", source: "automatic" },
  ])
  await expect(runtime.pluginRuntime.listActive("session-1")).resolves.toMatchObject([{ pluginID: "crm" }])
  await runtime.close()
})

test("exposes mounted plugin tools only to the active session", async () => {
  const fixture = await createToolFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const runtime = createNexumPluginRuntime({ registry })
  const request: ToolRequest = {
    sessionID: "session-1",
    toolName: "plugin__crm__order_query",
    action: "plugin__crm__order_query",
    resource: "order-1",
    input: { orderID: "order-1" },
  }

  await expect(runtime.listTools("session-1")).resolves.toEqual([])
  await runtime.activate({ sessionID: "session-1", pluginID: "crm", source: "explicit" })
  await expect(runtime.listTools("session-1")).resolves.toMatchObject([{ name: "plugin__crm__order_query" }])
  await expect(runtime.listTools("session-2")).resolves.toEqual([])
  await expect(runtime.executeTool(request)).resolves.toMatchObject({ ok: true, output: "order-1" })
  await runtime.deactivate({ sessionID: "session-1", pluginID: "crm" })
  await expect(runtime.executeTool(request)).resolves.toBeUndefined()
})

test("adds plugin tools to the model only after the Session activates the plugin", async () => {
  const fixture = await createToolFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const toolNames: string[][] = []
  const model: ModelPort = {
    async *prompt(input) {
      toolNames.push((input.tools ?? []).map((tool) => tool.name))
      yield { type: "text", content: "完成" }
      yield { type: "completed" }
    },
  }
  const runtime = createEmbeddedRuntime({ pluginRegistry: registry, model })
  const session = await runtime.sessions.create({ directory: fixture.root })

  await runtime.prompt({ sessionID: session.sessionID, text: "写一首诗" })
  await runtime.prompt({ sessionID: session.sessionID, text: "请查询订单" })

  expect(toolNames[0]?.some((name) => name.startsWith("plugin__"))).toBe(false)
  expect(toolNames[1]).toContain("plugin__crm__order_query")
  await runtime.close()
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

async function createToolFixture() {
  const root = await mkdtemp(join(tmpdir(), "nexum-plugin-tool-"))
  directories.push(root)
  const entry = join(root, "index.ts")
  await writeFile(entry, `export default {
  async mount() {
    return {
      capabilities: ["order.query"],
      tools: [{
        definition: {
          name: "order.query",
          description: "查询订单",
          parameters: { type: "object", properties: { orderID: { type: "string" } }, required: ["orderID"] },
        },
        async execute(request) {
          return { ok: true, output: request.input.orderID }
        },
      }],
      async unmount() {},
    }
  },
}`)
  return { root, entry }
}
