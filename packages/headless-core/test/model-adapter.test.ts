import { expect, test } from "bun:test"
import { createHeadlessModelConfigStore, createOpenAICompatibleModelPort } from "../src/index.ts"

async function collect(model: ReturnType<typeof createOpenAICompatibleModelPort>) {
  const chunks = []
  for await (const chunk of model.prompt({ sessionID: "session-model", text: "你好" })) chunks.push(chunk)
  return chunks
}

test("sends the active model configuration to one OpenAI-compatible endpoint", async () => {
  const config = createHeadlessModelConfigStore()
  await config.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "super-secret-value",
  })
  let request: { url: string; init?: RequestInit } | undefined
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async (url, init) => {
      request = { url: String(url), init }
      return Response.json({ choices: [{ message: { content: "模型回答" } }] })
    },
  })

  expect(await collect(model)).toEqual([{ type: "text", content: "模型回答" }, { type: "completed" }])
  expect(request?.url).toBe("https://model.example.com/v1/chat/completions")
  expect(request?.init?.headers).toMatchObject({ authorization: "Bearer super-secret-value" })
  expect(request?.init?.body).toContain('"model":"coding-model"')
})

test("returns a safe authentication error without provider fallback", async () => {
  const config = createHeadlessModelConfigStore()
  await config.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "super-secret-value",
  })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => new Response("credential super-secret-value rejected", { status: 401 }),
  })

  await expect(collect(model)).rejects.toMatchObject({ code: "authentication_failed" })
  await expect(collect(model)).rejects.toThrow("模型认证失败")
  try {
    await collect(model)
  } catch (error) {
    expect(String(error)).not.toContain("super-secret-value")
  }
})
