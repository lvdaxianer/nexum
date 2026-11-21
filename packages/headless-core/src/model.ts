/**
 * Headless Core 的单一 OpenAI-compatible ModelPort 适配器。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { HeadlessModelConfigStore } from "./model-config.js"
import type { ModelChunk, ModelMessage, ModelPort, ModelPrompt, ModelToolCall } from "./index.js"

/** 模型请求失败的稳定错误码。 */
export type HeadlessModelErrorCode = "not_configured" | "authentication_failed" | "unavailable" | "invalid_response"

/** 不泄露凭据值的模型运行时错误。 */
export class HeadlessModelError extends Error {
  constructor(
    readonly code: HeadlessModelErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessModelError"
  }
}

/** OpenAI-compatible ModelPort 配置。 */
export interface OpenAICompatibleModelPortOptions {
  readonly config: HeadlessModelConfigStore
  readonly fetch?: HeadlessFetch
}

/** 可替换的标准 HTTP fetch 端口。 */
export type HeadlessFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** 流式响应中按 index 逐步组装的工具调用。 */
interface PendingToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * 创建只访问一个活动 Base URL 的 ModelPort。
 *
 * 请求始终带 `stream: true`；上游按 SSE 推送时逐增量产出文本，
 * 忽略流式选项、直接返回 JSON 的网关走非流式解析兜底。
 *
 * @param options - 模型配置和可替换 fetch 实现
 * @returns OpenAI-compatible ModelPort
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createOpenAICompatibleModelPort(options: OpenAICompatibleModelPortOptions): ModelPort {
  const fetcher = options.fetch ?? fetch

  return {
    async *prompt(input) {
      const config = await options.config.get()
      if (!config) throw new HeadlessModelError("not_configured", "模型尚未配置")

      const credential = await options.config.resolveCredential()
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
      }
      if (credential) headers.authorization = `Bearer ${credential}`

      let response: Response
      try {
        response = await fetcher(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(createChatCompletionBody(config.model, input)),
          signal: input.signal,
        })
      } catch {
        throw new HeadlessModelError("unavailable", "模型服务不可达")
      }

      if (response.status === 401 || response.status === 403) {
        throw new HeadlessModelError("authentication_failed", "模型认证失败")
      }
      if (!response.ok) {
        throw new HeadlessModelError("unavailable", "模型服务请求失败")
      }

      if (isEventStream(response)) {
        yield* readStreamedModelResult(response)
        return
      }

      const result = await readModelResult(response)
      if (result.content !== undefined) yield { type: "text", content: result.content }
      if (result.toolCalls.length > 0) {
        yield toolCallChunk(result.toolCalls)
        return
      }
      yield { type: "completed" }
    },
  }
}

function createChatCompletionBody(model: string, input: ModelPrompt): Record<string, unknown> {
  const messages = input.messages?.map(serializeMessage) ?? [
    { role: "user", content: input.text },
    ...(input.toolResults ?? []).map((result, index) => ({
      role: "tool",
      tool_call_id: result.toolCallID ?? `tool-result-${index + 1}`,
      content: result.output,
    })),
  ]
  return {
    model,
    stream: true,
    messages,
    ...(input.tools && input.tools.length > 0
      ? {
          tools: input.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          tool_choice: "auto",
        }
      : {}),
  }
}

function serializeMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "system") return { role: "system", content: message.content }
  if (message.role === "user") return { role: "user", content: message.content }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallID, content: message.content }
  }
  return {
    role: "assistant",
    ...(message.content !== undefined ? { content: message.content } : { content: null }),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.input) },
          })),
        }
      : {}),
  }
}

function isEventStream(response: Response): boolean {
  return response.headers.get("content-type")?.includes("text/event-stream") ?? false
}

function toolCallChunk(toolCalls: readonly ModelToolCall[]): ModelChunk {
  const first = toolCalls[0]
  return {
    type: "tool-call",
    toolCalls,
    ...(toolCalls.length === 1 ? { toolCallID: first.id, toolName: first.name, toolInput: first.input } : {}),
  }
}

/**
 * 从 OpenAI-compatible SSE 响应中逐增量产出文本。
 *
 * 文本 delta 即时 yield；工具调用 delta 按 index 累积，
 * 在 `[DONE]` 或流结束时组装成单个 tool-call chunk 产出。
 *
 * @param response - 已确认状态码的流式模型响应
 * @returns 模型增量序列
 * @author lvdaxianer@yeah.net
 * @date 2026-11-21
 */
async function* readStreamedModelResult(response: Response): AsyncGenerator<ModelChunk, void> {
  if (!response.body) throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const pending = new Map<number, PendingToolCall>()
  let buffer = ""
  let sawPayload = false
  let finished = false
  try {
    while (!finished) {
      const read = await reader.read()
      finished = read.done
      buffer += decoder
        .decode(read.value, { stream: !read.done })
        .replaceAll("\r\n", "\n")
        .replaceAll("\r", "\n")
      if (read.done) buffer += "\n"
      let boundary = buffer.indexOf("\n\n")
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")
        for (const payload of streamDataPayloads(block)) {
          sawPayload = true
          if (payload === "[DONE]") {
            finished = true
            break
          }
          const delta = streamDelta(parseStreamPayload(payload))
          const text = deltaText(delta)
          if (text) yield { type: "text", content: text }
          accumulateToolCallDeltas(delta, pending)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  const toolCalls = resolvePendingToolCalls(pending)
  if (toolCalls.length > 0) {
    yield toolCallChunk(toolCalls)
    return
  }
  if (!sawPayload) throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  yield { type: "completed" }
}

/** 提取一个 SSE 事件块中的全部 data 负载。 */
function streamDataPayloads(block: string): string[] {
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
}

function parseStreamPayload(payload: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  }
  if (!isRecord(parsed)) throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  return parsed
}

/** 读取 chunk 的第一个 choices 项的 delta；心跳或无 choices 的负载返回 undefined。 */
function streamDelta(chunk: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(chunk.choices) || chunk.choices.length === 0) return undefined
  const first = chunk.choices[0]
  return isRecord(first) && isRecord(first.delta) ? first.delta : undefined
}

function deltaText(delta: Record<string, unknown> | undefined): string {
  const content = delta?.content
  return typeof content === "string" ? content : ""
}

/** 按 index 累积流式工具调用碎片，id/name/arguments 都可能分片到达。 */
function accumulateToolCallDeltas(
  delta: Record<string, unknown> | undefined,
  pending: Map<number, PendingToolCall>,
): void {
  if (!delta || !Array.isArray(delta.tool_calls)) return
  for (const raw of delta.tool_calls) {
    if (!isRecord(raw)) continue
    const index = typeof raw.index === "number" ? raw.index : 0
    const fn = isRecord(raw.function) ? raw.function : undefined
    const current = pending.get(index) ?? { id: "", name: "", arguments: "" }
    if (typeof raw.id === "string") current.id += raw.id
    if (typeof fn?.name === "string") current.name += fn.name
    if (typeof fn?.arguments === "string") current.arguments += fn.arguments
    pending.set(index, current)
  }
}

function resolvePendingToolCalls(pending: Map<number, PendingToolCall>): ModelToolCall[] {
  return [...pending.entries()].sort((left, right) => left[0] - right[0]).map(([, value]) => parsePendingToolCall(value))
}

function parsePendingToolCall(value: PendingToolCall): ModelToolCall {
  if (!value.id || !value.name) throw new HeadlessModelError("invalid_response", "模型工具调用格式无效")
  let input: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(value.arguments || "{}")
    if (!isRecord(parsed)) throw new Error()
    input = parsed
  } catch {
    throw new HeadlessModelError("invalid_response", "模型工具调用参数无效")
  }
  return { id: value.id, name: value.name, input }
}

interface ModelResult {
  readonly content?: string
  readonly toolCalls: readonly ModelToolCall[]
}

async function readModelResult(response: Response): Promise<ModelResult> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  }
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  }
  const first = body.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) {
    throw new HeadlessModelError("invalid_response", "模型响应格式无效")
  }
  const content = typeof first.message.content === "string" ? first.message.content : undefined
  const rawToolCalls = first.message.tool_calls
  if (rawToolCalls === undefined) return { content, toolCalls: [] }
  if (!Array.isArray(rawToolCalls)) throw new HeadlessModelError("invalid_response", "模型工具调用格式无效")

  const toolCalls = rawToolCalls.map(parseToolCall)
  return { content, toolCalls }
}

function parseToolCall(rawToolCall: unknown): ModelToolCall {
  if (!isRecord(rawToolCall) || typeof rawToolCall.id !== "string" || !isRecord(rawToolCall.function)) {
    throw new HeadlessModelError("invalid_response", "模型工具调用格式无效")
  }
  if (typeof rawToolCall.function.name !== "string") {
    throw new HeadlessModelError("invalid_response", "模型工具调用名称无效")
  }
  const rawArguments = rawToolCall.function.arguments
  try {
    const input: unknown = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments
    if (!isRecord(input)) throw new Error()
    return { id: rawToolCall.id, name: rawToolCall.function.name, input }
  } catch {
    throw new HeadlessModelError("invalid_response", "模型工具调用参数无效")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
