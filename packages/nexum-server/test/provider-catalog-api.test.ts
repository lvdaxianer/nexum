import { afterEach, expect, test } from "bun:test"
import { createNexumModelConfigStore } from "../../nexum-persistence/src/model-config.ts"
import { startNexumServer, type NexumServer } from "../src/index.ts"

const servers: NexumServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
})

test("serves a safe provider catalog without credentials or raw upstream configuration", async () => {
  const modelConfigStore = createNexumModelConfigStore()
  await modelConfigStore.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "super-secret-value",
  })
  const server = await startNexumServer({ port: 0, modelConfigStore })
  servers.push(server)

  const response = await fetch(new URL("/api/nexum/providers", server.url))
  const body = (await response.json()) as { data: { providers: Array<{ models: Array<Record<string, unknown>> }> } }

  expect(response.status).toBe(200)
  expect(body.data.providers[0]?.models[0]).toMatchObject({
    providerID: "openai-compatible",
    modelID: "coding-model",
    capabilities: ["text", "streaming", "tool_calling"],
  })
  expect(JSON.stringify(body)).not.toContain("super-secret-value")
  expect(JSON.stringify(body)).not.toContain("model.example.com")
})
