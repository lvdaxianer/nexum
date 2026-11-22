/** Nexum Core 的模型配置端口。 */

/** 模型配置输入，凭据可以直接传值或引用环境变量名。 */
export interface NexumModelConfigInput {
  readonly baseUrl: string
  readonly model: string
  readonly credential?: string
  readonly credentialRef?: string
}

/** 对外安全返回的模型配置。 */
export interface NexumModelConfig {
  readonly baseUrl: string
  readonly model: string
  readonly credentialConfigured: boolean
  readonly credentialRef?: string
}

/** 模型配置存储端口。 */
export interface NexumModelConfigStore {
  readonly get: () => Promise<NexumModelConfig | undefined>
  readonly update: (input: NexumModelConfigInput) => Promise<NexumModelConfig>
  readonly resolveCredential: () => Promise<string | undefined>
}

/** 模型配置领域错误码。 */
export type NexumModelConfigErrorCode = "invalid_url" | "invalid_model" | "invalid_credential"

/** 模型配置校验错误。 */
export class NexumModelConfigError extends Error {
  constructor(
    readonly code: NexumModelConfigErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "NexumModelConfigError"
  }
}
