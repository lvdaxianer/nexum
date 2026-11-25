import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createEmbeddedRuntime,
  createNexumEventHub,
  createNexumPluginRegistry,
  createNexumPluginRuntime,
} from "@nexum/application"
import type { NexumPluginManifest } from "@nexum/core"
import { createNexumSessionService } from "./test-ports.ts"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []
const runtimes: Array<{ readonly close: () => Promise<void> }> = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()))
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

test("exposes Plugin list, detail, activation, deactivation and lifecycle events", async () => {
  const fixture = await createPluginFixture()
  const { server, session, eventHub } = await createPluginServer(fixture)

  const listResponse = await fetch(new URL("/api/nexum/plugins", server.url))
  const detailResponse = await fetch(new URL("/api/nexum/plugins/crm", server.url))
  const activateResponse = await fetch(new URL("/api/nexum/plugins/crm/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })
  const activeDetailResponse = await fetch(new URL("/api/nexum/plugins/crm", server.url))
  const deactivateResponse = await fetch(new URL("/api/nexum/plugins/crm/deactivate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })
  const detailBody = (await activeDetailResponse.json()) as { data: { activeSessions: string[] } }

  expect(listResponse.status).toBe(200)
  expect(await listResponse.json()).toMatchObject({ data: [{ id: "crm", status: "registered" }] })
  expect(detailResponse.status).toBe(200)
  expect(activateResponse.status).toBe(200)
  expect(await activateResponse.json()).toMatchObject({
    data: { pluginID: "crm", sessionID: session.sessionID, status: "active", source: "explicit" },
  })
  expect(detailBody.data.activeSessions).toEqual([session.sessionID])
  expect(deactivateResponse.status).toBe(200)
  expect(await deactivateResponse.json()).toMatchObject({
    data: { pluginID: "crm", sessionID: session.sessionID, status: "deactivated" },
  })
  expect(eventHub.lastSequence(session.sessionID)).toBe(2)
  await expect(Bun.file(fixture.marker).text()).resolves.toBe("mounted\nunmounted\n")
})

test("maps unknown and not-ready Plugin activation to stable errors", async () => {
  const fixture = await createPluginFixture()
  const duplicate = await createPluginFixture()
  const registry = createNexumPluginRegistry({
    source: {
      discover: async () => [
        { address: fixture.root, entryPath: fixture.entry, manifest },
        { address: duplicate.root, entryPath: duplicate.entry, manifest },
      ],
    },
  })
  const { server, session } = await createPluginServer(fixture, registry)

  const unknownResponse = await fetch(new URL("/api/nexum/plugins/missing/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })
  const notReadyResponse = await fetch(new URL("/api/nexum/plugins/crm/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })

  expect(unknownResponse.status).toBe(404)
  expect(await unknownResponse.json()).toMatchObject({ errorCode: "NEXUM_PLUGIN_NOT_FOUND" })
  expect(notReadyResponse.status).toBe(409)
  expect(await notReadyResponse.json()).toMatchObject({ errorCode: "NEXUM_PLUGIN_NOT_READY" })
})

test("maps denied activation without executing the Plugin entry", async () => {
  const fixture = await createPluginFixture()
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const { server, session } = await createPluginServer(
    fixture,
    registry,
    { evaluate: async () => "deny" },
  )

  const response = await fetch(new URL("/api/nexum/plugins/crm/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })

  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ errorCode: "NEXUM_PLUGIN_PERMISSION_DENIED" })
  await expect(Bun.file(fixture.marker).text()).rejects.toThrow()
})

test("maps a failed Plugin mount and leaves the Session inactive", async () => {
  const fixture = await createPluginFixture("throw new Error(\"mount failed\")")
  const registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  })
  const { server, session } = await createPluginServer(fixture, registry)

  const response = await fetch(new URL("/api/nexum/plugins/crm/activate", server.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID: session.sessionID }),
  })

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ errorCode: "NEXUM_PLUGIN_MOUNT_FAILED" })
  const detailResponse = await fetch(new URL("/api/nexum/plugins/crm", server.url))
  expect(await detailResponse.json()).toMatchObject({ data: { activeSessions: [] } })
})

async function createPluginServer(
  fixture: { readonly root: string; readonly entry: string },
  registry = createNexumPluginRegistry({
    source: { discover: async () => [{ address: fixture.root, entryPath: fixture.entry, manifest }] },
  }),
  permission: { readonly evaluate: () => Promise<"allow" | "deny"> } = { evaluate: async () => "allow" },
) {
  const sessions = createNexumSessionService()
  const session = await sessions.create({ directory: fixture.root })
  const eventHub = createNexumEventHub()
  const pluginRuntime = createNexumPluginRuntime({ registry, permission })
  const runtime = createEmbeddedRuntime({ sessions, eventHub, pluginRegistry: registry, pluginRuntime })
  const server = await startNexumServer({ port: 0, runtime })
  servers.push(server)
  runtimes.push(runtime)
  return { server, session, eventHub }
}

async function createPluginFixture(prefix = "") {
  const root = await mkdtemp(join(tmpdir(), "nexum-plugin-api-"))
  directories.push(root)
  const entry = join(root, "index.ts")
  const marker = join(root, "lifecycle.log")
  await mkdir(join(root, "empty"))
  await writeFile(entry, `${prefix}\n${mountSource(marker)}`)
  return { root, entry, marker }
}

function mountSource(marker: string): string {
  return `export default {
  async mount() {
    await Bun.write(${JSON.stringify(marker)}, "mounted\\n")
    return {
      capabilities: ["order.query"],
      async unmount() {
        await Bun.write(${JSON.stringify(marker)}, (await Bun.file(${JSON.stringify(marker)}).text()) + "unmounted\\n")
      },
    }
  },
}`
}
