/**
 * Headless Core 的单模型运行时配置存储。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

/** 模型配置输入，凭据可以直接传值或引用环境变量名。 */
export interface HeadlessModelConfigInput {
  readonly baseUrl: string
  readonly model: string
  readonly credential?: string
  readonly credentialRef?: string
}

/** 对外安全返回的模型配置。 */
export interface HeadlessModelConfig {
  readonly baseUrl: string
  readonly model: string
  readonly credentialConfigured: boolean
  readonly credentialRef?: string
}

/** 模型配置存储端口。 */
export interface HeadlessModelConfigStore {
  readonly get: () => Promise<HeadlessModelConfig | undefined>
  readonly update: (input: HeadlessModelConfigInput) => Promise<HeadlessModelConfig>
  readonly resolveCredential: () => Promise<string | undefined>
}

/** 模型配置领域错误码。 */
export type HeadlessModelConfigErrorCode = "invalid_url" | "invalid_model" | "invalid_credential"

/** 模型配置校验错误。 */
export class HeadlessModelConfigError extends Error {
  constructor(
    readonly code: HeadlessModelConfigErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HeadlessModelConfigError"
  }
}

/**
 * 创建单一活动模型配置存储。
 *
 * @returns 保留最后一次有效配置且不暴露凭据值的存储端口
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export function createHeadlessModelConfigStore(): HeadlessModelConfigStore {
  let active: { safe: HeadlessModelConfig; credential?: string; credentialRef?: string } | undefined

  return {
    async get() {
      return active ? { ...active.safe } : undefined
    },
    async update(input) {
      const baseUrl = validateBaseUrl(input.baseUrl)
      const model = input.model.trim()
      if (!model) throw new HeadlessModelConfigError("invalid_model", "模型名称不能为空")
      if (input.credential !== undefined && input.credentialRef !== undefined) {
        throw new HeadlessModelConfigError("invalid_credential", "credential 与 credentialRef 只能配置一个")
      }
      if (input.credential !== undefined && !input.credential.trim()) {
        throw new HeadlessModelConfigError("invalid_credential", "credential 不能为空")
      }
      if (input.credentialRef !== undefined && !input.credentialRef.trim()) {
        throw new HeadlessModelConfigError("invalid_credential", "credentialRef 不能为空")
      }
      if (input.credential === undefined && input.credentialRef === undefined) {
        throw new HeadlessModelConfigError("invalid_credential", "必须配置凭据值或凭据引用")
      }

      const safe: HeadlessModelConfig = {
        baseUrl,
        model,
        credentialConfigured: input.credential !== undefined || input.credentialRef !== undefined,
        ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}),
      }
      active = {
        safe,
        ...(input.credential !== undefined ? { credential: input.credential } : {}),
        ...(input.credentialRef ? { credentialRef: input.credentialRef.trim() } : {}),
      }
      return { ...safe }
    },
    async resolveCredential() {
      if (active?.credential !== undefined) return active.credential
      if (active?.credentialRef !== undefined) return process.env[active.credentialRef]
      return undefined
    },
  }
}

function validateBaseUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error()
    if (url.username || url.password || url.search || url.hash) throw new Error()
    return url.toString().replace(/\/$/, "")
  } catch {
    throw new HeadlessModelConfigError("invalid_url", "Base URL 必须是合法的 HTTP 或 HTTPS 地址")
  }
}
