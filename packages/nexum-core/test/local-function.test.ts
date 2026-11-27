import { expect, test } from "bun:test"
import type { NexumLocalFunctionProvider } from "../src/index.ts"

test("describes local functions with independent schemas and execution context", async () => {
  const signal = new AbortController().signal
  const calls: Array<{ name: string; input: Record<string, unknown>; sessionID?: string }> = []
  const provider: NexumLocalFunctionProvider = {
    providerID: "local-tools",
    providerName: "Local Tools",
    functions: [
      {
        name: "get_weather",
        description: "查询天气",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        execute: async (input, context) => {
          calls.push({ name: "get_weather", input, ...(context.sessionID ? { sessionID: context.sessionID } : {}) })
          expect(context.signal).toBe(signal)
          return { temperature: 23 }
        },
      },
      {
        name: "create_issue",
        description: "创建 Issue",
        parameters: {
          type: "object",
          properties: { title: { type: "string" } },
          required: ["title"],
        },
        execute: async (input) => ({ title: input.title }),
      },
    ],
  }

  expect(provider.functions.map((item) => item.name)).toEqual(["get_weather", "create_issue"])
  expect(provider.functions[0]?.parameters).not.toEqual(provider.functions[1]?.parameters)
  await provider.functions[0]!.execute({ city: "Shanghai" }, { sessionID: "session-1", signal })
  expect(calls).toEqual([{ name: "get_weather", input: { city: "Shanghai" }, sessionID: "session-1" }])
})
