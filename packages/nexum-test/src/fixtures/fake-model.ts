import type { ModelChunk, ModelPort } from "@nexum/core"

export function createPocModel(): ModelPort {
  return {
    async *prompt(): AsyncIterable<ModelChunk> {
      yield { type: "text", content: "Nexum 文件持久化 POC 已收到请求。" }
      yield { type: "completed", finishReason: "stop" }
    },
  }
}
