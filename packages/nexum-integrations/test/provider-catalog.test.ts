import { expect, test } from "bun:test"
import { createNexumModelConfigStore } from "../../nexum-persistence/src/model-config.ts"
import { createOpenAICompatibleProviderCatalog } from "../src/index.ts"

test("lists a safe configured OpenAI-compatible model catalog", async () => {
  const config = createNexumModelConfigStore()
  await config.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "super-secret-value",
  })
  const catalog = await createOpenAICompatibleProviderCatalog({ config }).list()

  expect(catalog.providers).toEqual([
    {
      providerID: "openai-compatible",
      displayName: "OpenAI-compatible",
      status: "available",
      models: [
        {
          providerID: "openai-compatible",
          modelID: "coding-model",
          displayName: "coding-model",
          capabilities: ["text", "streaming", "tool_calling"],
        },
      ],
    },
  ])
  expect(JSON.stringify(catalog)).not.toContain("super-secret-value")
  expect(JSON.stringify(catalog)).not.toContain("model.example.com")
})

test("returns an empty catalog before a model is configured", async () => {
  const config = createNexumModelConfigStore()
  expect((await createOpenAICompatibleProviderCatalog({ config }).list()).providers).toEqual([])
})
