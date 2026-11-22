import { expect, test } from "bun:test"
import { runRealModelSmoke } from "../script/real-model-smoke.ts"

test("runs text and Function Calling smoke without logging the credential", async () => {
  const requests: RequestInit[] = []
  let call = 0
  const result = await runRealModelSmoke(
    {
      baseUrl: "https://model.example.com/v1",
      model: "fixture-model",
      apiKey: "credential-from-test",
    },
    async (_url, init) => {
      requests.push(init ?? {})
      call += 1
      if (call === 1) return Response.json({ choices: [{ message: { content: "fixture text" } }] })
      return Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_smoke_001",
                  type: "function",
                  function: { name: "read_file", arguments: JSON.stringify({ path: "README.md" }) },
                },
              ],
            },
          },
        ],
      })
    },
  )

  expect(result).toEqual({ text: "pass", functionCalling: "pass", endpointCalls: 2 })
  expect(requests).toHaveLength(2)
  expect(requests[0]?.headers).toMatchObject({ authorization: "Bearer credential-from-test" })
})

test("fails before network access when real model environment is incomplete", async () => {
  let fetchCalled = false
  await expect(
    runRealModelSmoke({ baseUrl: "https://model.example.com/v1", model: "fixture-model" }, async () => {
      fetchCalled = true
      return Response.error()
    }),
  ).rejects.toThrow("NEXUM_MODEL_API_KEY")
  expect(fetchCalled).toBe(false)
})
