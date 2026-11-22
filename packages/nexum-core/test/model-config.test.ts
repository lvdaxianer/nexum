import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createFileModelConfigStore, createNexumModelConfigStore } from "../../nexum-adapters/src/index.ts"
import { NexumModelConfigError } from "../src/index.ts"

test("stores one safe OpenAI-compatible model configuration", async () => {
  const store = createNexumModelConfigStore()

  const saved = await store.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "super-secret-value",
  })

  expect(saved).toEqual({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credentialConfigured: true,
  })
  expect(JSON.stringify(saved)).not.toContain("super-secret-value")
  expect(await store.get()).toEqual(saved)
})

test("rejects invalid updates and preserves the last valid configuration", async () => {
  const store = createNexumModelConfigStore()
  const valid = await store.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credentialRef: "MODEL_API_KEY",
  })

  await expect(store.update({ baseUrl: "not-a-url", model: "next-model" })).rejects.toBeInstanceOf(
    NexumModelConfigError,
  )
  await expect(store.update({ baseUrl: "https://model.example.com/v1", model: "   " })).rejects.toMatchObject({
    code: "invalid_model",
  })
  expect(await store.get()).toEqual(valid)
})

test("requires a credential value or credential reference", async () => {
  const store = createNexumModelConfigStore()

  await expect(
    store.update({
      baseUrl: "https://model.example.com/v1",
      model: "coding-model",
    }),
  ).rejects.toMatchObject({ code: "invalid_credential" })
})

test("restores a file-backed model configuration after the store is recreated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexum-model-config-"))
  try {
    const filePath = join(directory, "model-config.json")
    const firstStore = createFileModelConfigStore({ filePath })
    const saved = await firstStore.update({
      baseUrl: "https://model.example.com/v1",
      model: "coding-model",
      credential: "super-secret-value",
    })

    const secondStore = createFileModelConfigStore({ filePath })
    expect(await secondStore.get()).toEqual(saved)
    expect(await secondStore.resolveCredential()).toBe("super-secret-value")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
