/** Headless Runtime 的安全模型能力探测端口。 */

import type { ModelPort } from "./index.js"

/** 模型 Probe 支持的能力范围。 */
export type HeadlessModelProbeMode = "text" | "function_calling" | "both"

/** 模型 Probe 对外返回的安全状态。 */
export interface HeadlessModelProbeResult {
  readonly text: "pass" | "skipped"
  readonly functionCalling: "pass" | "skipped"
}

/** 模型 Probe 端口。 */
export interface HeadlessModelProbePort {
  readonly probe: (input?: { readonly mode?: HeadlessModelProbeMode }) => Promise<HeadlessModelProbeResult>
}

/** 模型 Probe 的稳定错误。 */
export class HeadlessModelProbeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HeadlessModelProbeError"
  }
}

/** 创建不返回模型内容的安全能力探测端口。 */
export function createHeadlessModelProbePort(options: { readonly model: ModelPort }): HeadlessModelProbePort {
  return {
    async probe(input = {}) {
      const mode = input.mode ?? "both"
      assertMode(mode)
      const text = mode === "function_calling" ? "skipped" : await probeText(options.model)
      const functionCalling = mode === "text" ? "skipped" : await probeFunctionCalling(options.model)
      return { text, functionCalling }
    },
  }
}

async function probeText(model: ModelPort): Promise<"pass"> {
  for await (const chunk of model.prompt({ sessionID: "model-probe", text: "请只返回一句简短文本" })) {
    if (chunk.type === "text" && (chunk.content ?? "").trim()) return "pass"
  }
  throw new HeadlessModelProbeError("模型未返回文本响应")
}

async function probeFunctionCalling(model: ModelPort): Promise<"pass"> {
  for await (const chunk of model.prompt({
    sessionID: "model-probe",
    text: "请调用 read 工具读取 README.md",
    tools: [
      {
        name: "read",
        description: "读取工作目录内的文件",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
          additionalProperties: false,
        },
      },
    ],
  })) {
    if (chunk.type === "tool-call" && (chunk.toolCalls?.length ?? (chunk.toolName ? 1 : 0)) > 0) return "pass"
  }
  throw new HeadlessModelProbeError("模型未返回 Function Calling 响应")
}

function assertMode(mode: string): asserts mode is HeadlessModelProbeMode {
  if (mode !== "text" && mode !== "function_calling" && mode !== "both") {
    throw new HeadlessModelProbeError("模型 Probe 模式无效")
  }
}
