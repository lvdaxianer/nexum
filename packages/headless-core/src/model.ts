/**
 * Headless Core 的单一 OpenAI-compatible ModelPort 适配器。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { HeadlessModelConfigStore } from "./model-config.js"
import type { ModelMessage, ModelPort, ModelPrompt } from "./index.js"

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

/**
 * 创建只访问一个活动 Base URL 的 ModelPort。
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

      const result = await readModelResult(response)
      if (result.content !== undefined) yield { type: "text", content: result.content }
      if (result.toolCalls.length > 0) {
        const first = result.toolCalls[0]
        yield {
          type: "tool-call",
          toolCalls: result.toolCalls,
          ...(result.toolCalls.length === 1
            ? { toolCallID: first.id, toolName: first.name, toolInput: first.input }
            : {}),
        }
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
    stream: false,
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

interface ModelResult {
  readonly content?: string
  readonly toolCalls: readonly { id: string; name: string; input: Record<string, unknown> }[]
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

  const toolCalls = rawToolCalls.map((rawToolCall) => {
    if (!isRecord(rawToolCall) || typeof rawToolCall.id !== "string" || !isRecord(rawToolCall.function)) {
      throw new HeadlessModelError("invalid_response", "模型工具调用格式无效")
    }
    if (typeof rawToolCall.function.name !== "string") {
      throw new HeadlessModelError("invalid_response", "模型工具调用名称无效")
    }
    const rawArguments = rawToolCall.function.arguments
    try {
      const input = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments
      if (!isRecord(input)) throw new Error()
      return { id: rawToolCall.id, name: rawToolCall.function.name, input }
    } catch {
      throw new HeadlessModelError("invalid_response", "模型工具调用参数无效")
    }
  })
  return { content, toolCalls }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
