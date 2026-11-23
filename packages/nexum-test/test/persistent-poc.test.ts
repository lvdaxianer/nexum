import { afterEach, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLocalRuntime } from "@nexum/application"
import { Nexum } from "@nexum/client"
import { startNexumServer } from "@nexum/server"
import { createPocModel } from "../src/fixtures/fake-model.ts"

let dataDirectory: string | undefined
let workspaceDirectory: string | undefined
let server: Awaited<ReturnType<typeof startNexumServer>> | undefined

afterEach(async () => {
  await server?.stop(true)
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true })
  if (workspaceDirectory) await rm(workspaceDirectory, { recursive: true, force: true })
  server = undefined
  dataDirectory = undefined
  workspaceDirectory = undefined
})

test("runs the protocol path with file persistence and restores the session", async () => {
  const dataPath = await mkdtemp(join(tmpdir(), "nexum-test-poc-data-"))
  const workspacePath = await mkdtemp(join(tmpdir(), "nexum-test-poc-workspace-"))
  dataDirectory = dataPath
  workspaceDirectory = workspacePath
  const runtime = createLocalRuntime({ dataDirectory: dataPath, model: createPocModel() })
  server = await startNexumServer({ port: 0, runtime })
  const client = Nexum.make({ baseUrl: server.url.origin })

  const created = await client.experimental.nexum.session.create({ directory: workspacePath, name: "持久化 POC" })
  const memory = runtime.memory
  const interactions = runtime.interactionStore
  if (!memory || !interactions) throw new Error("本地 Runtime 未组合文件型 Memory 或 Interaction Store")
  await runtime.modelConfig.update({
    baseUrl: "https://model.example/v1",
    model: "poc-model",
    credential: "poc-credential",
  })
  await memory.upsert({ id: "poc", namespace: "test", content: "file-backed runtime" })
  await runtime.permissionBroker.policy.add({ action: "read", resource: "README.md", effect: "allow" })
  await interactions.save({
    requestID: "poc-interaction",
    sessionID: created.data.id,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    kind: "permission",
    action: "read",
    resource: "README.md",
  })
  await client.experimental.nexum.session.prompt({ sessionID: created.data.id, text: "验证 Nexum" })
  await waitForCompleted(client, created.data.id)

  await server.stop(true)
  await runtime.close()
  server = undefined

  const restoredRuntime = createLocalRuntime({ dataDirectory: dataPath, model: createPocModel() })
  const restored = await restoredRuntime.sessions.list()
  expect(restored).toHaveLength(1)
  expect(restored[0]?.status).toBe("completed")
  expect(await readFile(join(dataPath, "sessions.json"), "utf8")).toContain(created.data.id)
  expect(await restoredRuntime.modelConfig.get()).toMatchObject({ model: "poc-model", credentialConfigured: true })
  expect(await restoredRuntime.memory?.search({ text: "file-backed" })).toHaveLength(1)
  expect(await restoredRuntime.permissionBroker.policy.list()).toHaveLength(1)
  expect(await restoredRuntime.interactionStore?.get("poc-interaction")).toMatchObject({ status: "orphaned" })
  await Promise.all(
    ["events.json", "messages.json", "model-config.json", "permission-policies.json", "interactions.json", "memory.json"].map((file) =>
      access(join(dataPath, file)),
    ),
  )
  await restoredRuntime.close()
})

async function waitForCompleted(client: ReturnType<typeof Nexum.make>, sessionID: string): Promise<void> {
  let status = "unknown"
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await client.experimental.nexum.session.state({ sessionID })
    status = state.data.session.status
    if (status === "completed") return
    await Bun.sleep(25)
  }
  throw new Error(`POC Session 未在预期时间内完成：${status}`)
}
