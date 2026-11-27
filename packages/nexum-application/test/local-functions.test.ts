import { expect, test } from "bun:test"
import type { NexumLocalFunctionProvider, ToolRequest } from "@nexum/core"
import { createNexumLocalFunctionRegistry } from "../src/local-functions.ts"

function request(toolName: string, input: Record<string, unknown>): ToolRequest {
  return {
    sessionID: "session-1",
    toolName,
    action: "local.call",
    resource: toolName,
    input,
    signal: new AbortController().signal,
  }
}

test("registers local functions with independent definitions and executes the selected handler", async () => {
  const calls: Array<{ name: string; sessionID: string }> = []
  const provider = createProvider({
    get_weather: {
      description: "查询天气",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
      execute: async (_input, context) => {
        calls.push({ name: "get_weather", sessionID: context.sessionID })
        return { temperature: 23 }
      },
    },
    create_issue: {
      description: "创建 Issue",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
      execute: async (input) => ({ title: input.title }),
    },
  })
  const registry = createNexumLocalFunctionRegistry([provider])

  expect(registry.names).toEqual(["local__local_tools__get_weather", "local__local_tools__create_issue"])
  expect(registry.definitions.map((item) => item.parameters)).toEqual([
    provider.functions[0]!.parameters,
    provider.functions[1]!.parameters,
  ])
  await expect(registry.execute(request("local__local_tools__get_weather", { city: "Shanghai" }))).resolves.toEqual({
    ok: true,
    output: JSON.stringify({ temperature: 23 }),
  })
  expect(calls).toEqual([{ name: "get_weather", sessionID: "session-1" }])
})

test("rejects invalid local function input before calling the handler", async () => {
  let calls = 0
  const registry = createNexumLocalFunctionRegistry([createProvider({
    get_weather: {
      description: "查询天气",
      parameters: { type: "object", required: ["city"], properties: { city: { type: "string" } } },
      execute: async () => {
        calls += 1
        return "never"
      },
    },
  })])

  await expect(registry.execute(request("local__local_tools__get_weather", {}))).resolves.toMatchObject({
    ok: false,
    output: "本地函数参数无效",
  })
  expect(calls).toBe(0)
})

test("treats identical registrations as no-ops and rejects schema conflicts", () => {
  const provider = createProvider({
    echo: {
      description: "回显文本",
      parameters: { type: "object", properties: { value: { type: "string" } } },
      execute: async (input) => input.value,
    },
  })
  const registry = createNexumLocalFunctionRegistry([provider])

  expect(() => registry.register(provider)).not.toThrow()
  expect(registry.names).toHaveLength(1)
  expect(() => registry.register(createProvider({
    echo: {
      description: "回显文本",
      parameters: { type: "object", properties: { value: { type: "number" } } },
      execute: async (input) => input.value,
    },
  }))).toThrow("本地函数定义冲突")
})

test("does not partially register a provider when one function conflicts", () => {
  const registry = createNexumLocalFunctionRegistry([{
    providerID: "existing",
    providerName: "Existing",
    functions: [{ name: "conflict", description: "Existing", parameters: { type: "object" }, execute: async () => "existing" }],
  }])

  expect(() => registry.register({
    providerID: "existing",
    providerName: "New",
    functions: [
      { name: "added", description: "Added", parameters: { type: "object" }, execute: async () => "added" },
      { name: "conflict", description: "Different", parameters: { type: "object" }, execute: async () => "different" },
    ],
  })).toThrow("本地函数定义冲突")
  expect(registry.names).toEqual(["local__existing__conflict"])
})

function createProvider(functions: Record<string, {
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly execute: NexumLocalFunctionProvider["functions"][number]["execute"]
}>): NexumLocalFunctionProvider {
  return {
    providerID: "local-tools",
    providerName: "Local Tools",
    functions: Object.entries(functions).map(([name, definition]) => ({ name, ...definition })),
  }
}
