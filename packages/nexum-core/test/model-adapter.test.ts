import { expect, test } from "bun:test"
import { createNexumModelConfigStore, createOpenAICompatibleModelPort } from "../../nexum-adapters/src/index.ts"

async function collect(model: ReturnType<typeof createOpenAICompatibleModelPort>) {
  const chunks = []
  for await (const chunk of model.prompt({ sessionID: "session-model", text: "你好" })) chunks.push(chunk)
  return chunks
}

test("sends the active model configuration to one OpenAI-compatible endpoint", async () => {
  const config = createNexumModelConfigStore()
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
  expect(request?.init?.body).toContain('"stream":true')
})

test("preserves the provider finish reason so the loop can continue truncated output", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model", credential: "test-credential" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "半截回答" } }] }),
  })

  expect(await collect(model)).toEqual([
    { type: "text", content: "半截回答" },
    { type: "completed", finishReason: "length" },
  ])
})

test("classifies provider context-window errors for automatic compaction", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model", credential: "test-credential" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => new Response("maximum context length exceeded", { status: 400 }),
  })

  await expect(collect(model)).rejects.toMatchObject({ code: "context_overflow" })
})

test("requests streaming and yields each SSE text delta as it arrives", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model", credential: "test-credential" })
  const deltas = ["你好", "，", "世界"]
  const sseBody = deltas
    .map(
      (content) =>
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content } }] })}\n\n`,
    )
    .join("")
    .concat(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`)
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => new Response(`${sseBody}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }),
  })

  expect(await collect(model)).toEqual([
    { type: "text", content: "你好" },
    { type: "text", content: "，" },
    { type: "text", content: "世界" },
    { type: "completed", finishReason: "stop" },
  ])
})

test("assembles fragmented streaming tool calls into a single chunk", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model", credential: "test-credential" })
  const sseBody = [
    {
      choices: [
        {
          index: 0,
          delta: {
            reasoning_content: "先调用写入工具。",
            tool_calls: [{ index: 0, id: "call_stream_1", type: "function", function: { name: "write", arguments: "" } }],
          },
        },
      ],
    },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"notes.txt' } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '","content":"hello"}' } }] } }] },
  ]
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("")
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => new Response(`${sseBody}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } }),
  })

  expect(await collect(model)).toEqual([
    { type: "reasoning", reasoningContent: "先调用写入工具。" },
    {
      type: "tool-call",
      reasoningContent: "先调用写入工具。",
      toolCalls: [{ id: "call_stream_1", name: "write", input: { path: "notes.txt", content: "hello" } }],
      toolCallID: "call_stream_1",
      toolName: "write",
      toolInput: { path: "notes.txt", content: "hello" },
    },
  ])
})

test("rejects a malformed SSE payload with a stable error", async () => {
  const config = createNexumModelConfigStore()
  await config.update({ baseUrl: "https://model.example.com/v1", model: "coding-model", credential: "test-credential" })
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async () => new Response("data: not-json\n\ndata: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } }),
  })

  await expect(collect(model)).rejects.toMatchObject({ code: "invalid_response" })
})

test("returns a safe authentication error without provider fallback", async () => {
  const config = createNexumModelConfigStore()
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

test("sends tool definitions and parses an OpenAI-compatible function call", async () => {
  const config = createNexumModelConfigStore()
  await config.update({
    baseUrl: "https://model.example.com/v1",
    model: "coding-model",
    credential: "test-credential",
  })
  let requestBody: Record<string, unknown> | undefined
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_write_001",
                  type: "function",
                  function: {
                    name: "write",
                    arguments: JSON.stringify({ path: "notes.txt", content: "hello" }),
                  },
                },
              ],
            },
          },
        ],
      })
    },
  })

  const chunks = []
  for await (const chunk of model.prompt({
    sessionID: "session-model",
    text: "请写入 notes.txt",
    tools: [
      {
        name: "write",
        description: "写入 Session 工作目录内的文件",
        parameters: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
    ],
  } as never)) {
    chunks.push(chunk)
  }

  expect(chunks).toEqual([
    {
      type: "tool-call",
      toolCalls: [{ id: "call_write_001", name: "write", input: { path: "notes.txt", content: "hello" } }],
      toolCallID: "call_write_001",
      toolName: "write",
      toolInput: { path: "notes.txt", content: "hello" },
    },
  ])
  expect(requestBody).toMatchObject({
    tools: [
      {
        type: "function",
        function: { name: "write", description: "写入 Session 工作目录内的文件" },
      },
    ],
    tool_choice: "auto",
  })
})

test("preserves reasoning content when continuing a thinking model tool call", async () => {
  const config = createNexumModelConfigStore()
  await config.update({
    baseUrl: "https://model.example.com/v1",
    model: "thinking-model",
    credential: "test-credential",
  })
  const requestBodies: Record<string, unknown>[] = []
  const model = createOpenAICompatibleModelPort({
    config,
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({
        choices: [
          {
            message: {
              content: "",
              reasoning_content: "先调用工具确认环境。",
              tool_calls: [
                {
                  id: "call_shell_001",
                  type: "function",
                  function: { name: "shell", arguments: JSON.stringify({ command: "pwd" }) },
                },
              ],
            },
          },
        ],
      })
    },
  })

  const first = []
  for await (const chunk of model.prompt({ sessionID: "session-model", text: "查看目录" })) first.push(chunk)
  const firstToolCall = first.find((chunk) => chunk.type === "tool-call")
  if (firstToolCall?.type !== "tool-call") throw new Error("expected a tool call")

  const messages = [
    { role: "user" as const, content: "查看目录" },
    {
      role: "assistant" as const,
      reasoningContent: firstToolCall.reasoningContent,
      toolCalls: firstToolCall.toolCalls,
    },
    { role: "tool" as const, toolCallID: "call_shell_001", content: "/workspace" },
  ]
  for await (const _chunk of model.prompt({ sessionID: "session-model", text: "查看目录", messages })) {}

  expect(requestBodies[1]?.messages).toMatchObject([
    { role: "user", content: "查看目录" },
    { role: "assistant", reasoning_content: "先调用工具确认环境。" },
    { role: "tool", tool_call_id: "call_shell_001", content: "/workspace" },
  ])
})
