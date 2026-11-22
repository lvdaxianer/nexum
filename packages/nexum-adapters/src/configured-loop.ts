/** 按适配器模型配置组合 Core Coding Loop。 */

import {
  createNexumCodingLoop,
  type NexumCodingLoop,
  type NexumCodingLoopOptions,
  type NexumModelConfigStore,
} from "@nexum/core"
import { createOpenAICompatibleModelPort } from "./openai-model.ts"

/** 使用活动模型配置创建 Coding Loop。 */
export function createNexumConfiguredCodingLoop(
  options: Omit<NexumCodingLoopOptions, "model"> & { readonly modelConfig: NexumModelConfigStore },
): NexumCodingLoop {
  return createNexumCodingLoop({
    ...options,
    model: createOpenAICompatibleModelPort({ config: options.modelConfig }),
  })
}
