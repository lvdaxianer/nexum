/** OpenAI-compatible Provider 的安全模型目录适配器。 */

import type {
  NexumModelConfigStore,
  NexumProviderCatalogPort,
  NexumProviderDescriptor,
} from "@nexum/core"

export interface OpenAICompatibleProviderCatalogOptions {
  readonly config: NexumModelConfigStore
  readonly providerID?: string
  readonly displayName?: string
}

/** 从当前安全模型配置构造不含凭据和 Base URL 的 Provider 目录。 */
export function createOpenAICompatibleProviderCatalog(
  options: OpenAICompatibleProviderCatalogOptions,
): NexumProviderCatalogPort {
  return {
    async list() {
      const config = await options.config.get()
      const providers: readonly NexumProviderDescriptor[] = config
        ? [
            {
              providerID: options.providerID ?? "openai-compatible",
              displayName: options.displayName ?? "OpenAI-compatible",
              status: "available",
              models: [
                {
                  providerID: options.providerID ?? "openai-compatible",
                  modelID: config.model,
                  displayName: config.model,
                  capabilities: ["text", "streaming", "tool_calling"],
                },
              ],
            },
          ]
        : []
      return { providers, generatedAt: new Date().toISOString() }
    },
  }
}
