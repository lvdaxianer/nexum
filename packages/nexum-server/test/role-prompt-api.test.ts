import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLocalRuntime } from "@nexum/application"
import { createFileRolePromptStore } from "@nexum/persistence-file"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("reads, updates and resets the persisted default role prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-role-api-"))
  directories.push(directory)
  const filePath = join(directory, "role-prompt.json")
  const runtime = createLocalRuntime({ dataDirectory: join(directory, ".nexum"), rolePrompt: createFileRolePromptStore({ filePath }) })
  const server = await startNexumServer({ port: 0, runtime })
  servers.push(server)

  const getDefault = await fetch(new URL("/api/nexum/role-prompt", server.url))
  expect(getDefault.status).toBe(200)
  const defaultPayload = (await getDefault.json()) as { data: { source: string } }
  expect(defaultPayload.data.source).toBe("default")

  const update = await fetch(new URL("/api/nexum/role-prompt", server.url), {
    method: "PUT",
    body: JSON.stringify({ prompt: "思考和回答都使用中文。" }),
  })
  expect(update.status).toBe(200)
  const updatePayload = (await update.json()) as { data: { prompt: string; source: string } }
  expect(updatePayload.data).toMatchObject({
    prompt: "思考和回答都使用中文。",
    source: "custom",
  })

  const reset = await fetch(new URL("/api/nexum/role-prompt", server.url), { method: "DELETE" })
  expect(reset.status).toBe(200)
  const resetPayload = (await reset.json()) as { data: { source: string } }
  expect(resetPayload.data.source).toBe("default")
})
