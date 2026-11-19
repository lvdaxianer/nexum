import { expect, test } from "bun:test"
import { createHeadlessModelConfigStore, HeadlessModelConfigError } from "../src/index.ts"

test("stores one safe OpenAI-compatible model configuration", async () => {
  const store = createHeadlessModelConfigStore()

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
  const store = createHeadlessModelConfigStore()
  const valid = await store.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credentialRef: "MODEL_API_KEY",
  })

  await expect(store.update({ baseUrl: "not-a-url", model: "next-model" })).rejects.toBeInstanceOf(
    HeadlessModelConfigError,
  )
  await expect(store.update({ baseUrl: "https://model.example.com/v1", model: "   " })).rejects.toMatchObject({
    code: "invalid_model",
  })
  expect(await store.get()).toEqual(valid)
})
