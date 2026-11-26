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

/** Provider/model 可以安全展示给调用方的能力。 */
export type NexumModelCapability = "text" | "reasoning" | "tool_calling" | "vision" | "streaming"

/** 模型目录中的价格估算；不代表最终结算金额。 */
export interface NexumModelPricing {
  readonly inputPerMillionTokens?: number
  readonly outputPerMillionTokens?: number
  readonly currency?: string
  readonly source?: string
  readonly updatedAt?: string
}

/** 模型响应中的可选、有限用量信息。 */
export interface NexumModelUsage {
  readonly promptTokens?: number
  readonly completionTokens?: number
  readonly totalTokens?: number
  readonly estimatedCost?: number
  readonly currency?: string
}

/** Provider 目录中的安全模型描述。 */
export interface NexumModelDescriptor {
  readonly providerID: string
  readonly modelID: string
  readonly displayName?: string
  readonly capabilities: readonly NexumModelCapability[]
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly pricing?: NexumModelPricing
}

/** Provider 目录中的安全 Provider 描述。 */
export interface NexumProviderDescriptor {
  readonly providerID: string
  readonly displayName: string
  readonly status: "available" | "unavailable"
  readonly models: readonly NexumModelDescriptor[]
  readonly errorCode?: "unavailable"
}

/** 供客户端选择和展示的 Provider/model 目录。 */
export interface NexumProviderCatalog {
  readonly providers: readonly NexumProviderDescriptor[]
  readonly generatedAt: string
}

/** Provider catalog 的只读可替换端口。 */
export interface NexumProviderCatalogPort {
  readonly list: () => Promise<NexumProviderCatalog>
}

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
