import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createFilePersistence, createMemoryPersistence } from "../src/index.ts"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

test("creates isolated in-memory persistence compositions with every runtime store", async () => {
  const first = createMemoryPersistence()
  const second = createMemoryPersistence()

  await first.modelConfig.update({ baseUrl: "https://model.example/v1", model: "reasoning-model", credential: "secret" })

  expect(await second.modelConfig.get()).toBeUndefined()
  expect(first.sessionStore).toBeDefined()
  expect(first.messageStore).toBeDefined()
  expect(first.interactionStore).toBeDefined()
  expect(first.rolePrompt).toBeDefined()
  expect(first.eventHub).toBeDefined()
  expect(first.permissionPolicyStore).toBeDefined()
  expect(first.memory).toBeDefined()
  expect(first.skillRegistrationStore).toBeDefined()
  expect(first.mcpConfigStore).toBeDefined()
  expect(first.mcpCredentialStore).toBeDefined()
})

test("restores file persistence composition from one data directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-persistence-composition-"))
  directories.push(directory)

  const first = createFilePersistence({ dataDirectory: directory })
  await first.modelConfig.update({ baseUrl: "https://model.example/v1", model: "model", credential: "secret" })
  await first.rolePrompt.update("使用中文回答。")

  const reopened = createFilePersistence({ dataDirectory: directory })

  expect(await reopened.modelConfig.get()).toMatchObject({ model: "model", credentialConfigured: true })
  expect(await reopened.rolePrompt.get()).toMatchObject({ prompt: "使用中文回答。", source: "custom" })
})
