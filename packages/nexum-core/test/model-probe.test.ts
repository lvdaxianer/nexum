import { expect, test } from "bun:test"
import { createNexumModelProbePort, type ModelPort } from "../src/index.ts"

test("probes text and Function Calling without returning model content", async () => {
  const calls: Array<{ text: string; tools: number }> = []
  const model: ModelPort = {
    async *prompt(input) {
      calls.push({ text: input.text, tools: input.tools?.length ?? 0 })
      if (input.tools?.length) {
        yield { type: "tool-call", toolCallID: "probe_call", toolName: "read", toolInput: { path: "README.md" } }
        return
      }
      yield { type: "text", content: "secret model content that must not leave the probe" }
    },
  }

  const result = await createNexumModelProbePort({ model }).probe()

  expect(result).toEqual({ text: "pass", functionCalling: "pass" })
  expect(calls).toHaveLength(2)
  expect(calls[0]?.tools).toBe(0)
  expect(calls[1]?.tools).toBe(1)
  expect(JSON.stringify(result)).not.toContain("secret model content")
})

test("supports a single probe mode", async () => {
  let calls = 0
  const model: ModelPort = {
    async *prompt() {
      calls += 1
      yield { type: "text", content: "ok" }
    },
  }

  await expect(createNexumModelProbePort({ model }).probe({ mode: "text" })).resolves.toEqual({
    text: "pass",
    functionCalling: "skipped",
  })
  expect(calls).toBe(1)
})

test("rejects a probe when the requested capability is absent", async () => {
  const model: ModelPort = {
    async *prompt() {
      yield { type: "completed" }
    },
  }

  await expect(createNexumModelProbePort({ model }).probe({ mode: "text" })).rejects.toThrow("文本响应")
})

test("times out a probe that never produces a model chunk", async () => {
  let aborted = false
  const model: ModelPort = {
    async *prompt(input) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      aborted = input.signal?.aborted ?? false
      yield { type: "completed" }
    },
  }

  await expect(createNexumModelProbePort({ model }).probe({ mode: "text", timeoutMs: 10 })).rejects.toMatchObject({ code: "timeout" })
  await new Promise((resolve) => setTimeout(resolve, 120))
  expect(aborted).toBe(true)
})
