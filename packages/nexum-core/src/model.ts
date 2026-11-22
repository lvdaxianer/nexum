/**
 * Nexum Core 的模型端口错误与适配器配置契约。
 */

/** 模型请求失败的稳定错误码。 */
export type NexumModelErrorCode =
  | "not_configured"
  | "authentication_failed"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "upstream_error"
  | "invalid_request"
  | "unavailable"
  | "context_overflow"
  | "invalid_response"

/** 模型失败中可以安全供重试策略和诊断使用的上游元数据。 */
export interface NexumModelErrorDetails {
  readonly status?: number
  readonly providerCode?: string
  readonly retryAfterMs?: number
}

/** 不泄露凭据值的模型运行时错误。 */
export class NexumModelError extends Error {
  constructor(
    readonly code: NexumModelErrorCode,
    message: string,
    readonly details: NexumModelErrorDetails = {},
  ) {
    super(message)
    this.name = "NexumModelError"
  }
}

/** 可替换的标准 HTTP fetch 端口。 */
export type NexumFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
