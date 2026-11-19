/**
 * Headless Core 的单一 OpenAI-compatible ModelPort 适配器。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import type { HeadlessModelConfigStore } from "./model-config.js"
import type { ModelPort } from "./index.js"

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
          body: JSON.stringify({
            model: config.model,
            stream: false,
            messages: [
              { role: "user", content: input.text },
              ...(input.toolResults ?? []).map((result) => ({ role: "tool", content: result.output })),
            ],
          }),
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

      const content = await readModelContent(response)
      if (content !== undefined) yield { type: "text", content }
      yield { type: "completed" }
    },
  }
}

async function readModelContent(response: Response): Promise<string | undefined> {
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
  return typeof first.message.content === "string" ? first.message.content : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
