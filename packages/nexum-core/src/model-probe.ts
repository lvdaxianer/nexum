/** Nexum Runtime 的安全模型能力探测端口。 */

import type { ModelPort } from "./index.js"

/** 模型 Probe 支持的能力范围。 */
export type NexumModelProbeMode = "text" | "function_calling" | "both"

/** 模型 Probe 对外返回的安全状态。 */
export interface NexumModelProbeResult {
  readonly text: "pass" | "skipped"
  readonly functionCalling: "pass" | "skipped"
}

export interface NexumModelProbeInput {
  readonly mode?: NexumModelProbeMode
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

/** 模型 Probe 端口。 */
export interface NexumModelProbePort {
  readonly probe: (input?: NexumModelProbeInput) => Promise<NexumModelProbeResult>
}

/** 模型 Probe 的稳定错误。 */
export class NexumModelProbeError extends Error {
  constructor(message: string, readonly code: "failed" | "timeout" | "cancelled" = "failed") {
    super(message)
    this.name = "NexumModelProbeError"
  }
}

/** 创建不返回模型内容的安全能力探测端口。 */
export function createNexumModelProbePort(options: { readonly model: ModelPort }): NexumModelProbePort {
  return {
    async probe(input = {}) {
      const mode = input.mode ?? "both"
      assertMode(mode)
      const timeoutMs = normalizeTimeout(input.timeoutMs) ?? DEFAULT_MODEL_PROBE_TIMEOUT_MS
      const controller = new AbortController()
      const operation = probeCapabilities(options.model, mode, controller.signal)
      let timer: ReturnType<typeof setTimeout> | undefined
      let abort: (() => void) | undefined
      const termination = new Promise<never>((_, reject) => {
        abort = () => {
          controller.abort()
          reject(new NexumModelProbeError("模型 Probe 已取消", "cancelled"))
        }
        input.signal?.addEventListener("abort", abort, { once: true })
        timer = setTimeout(() => {
          controller.abort()
          reject(new NexumModelProbeError("模型 Probe 超时", "timeout"))
        }, timeoutMs)
        if (input.signal?.aborted) abort()
      })
      return Promise.race([operation, termination]).finally(() => {
        if (timer) clearTimeout(timer)
        if (abort) input.signal?.removeEventListener("abort", abort)
      })
    },
  }
}

const DEFAULT_MODEL_PROBE_TIMEOUT_MS = 30_000

async function probeCapabilities(model: ModelPort, mode: NexumModelProbeMode, signal: AbortSignal): Promise<NexumModelProbeResult> {
  const text = mode === "function_calling" ? "skipped" : await probeText(model, signal)
  const functionCalling = mode === "text" ? "skipped" : await probeFunctionCalling(model, signal)
  return { text, functionCalling }
}

async function probeText(model: ModelPort, signal: AbortSignal): Promise<"pass"> {
  for await (const chunk of model.prompt({ sessionID: "model-probe", text: "请只返回一句简短文本", signal })) {
    if (chunk.type === "text" && (chunk.content ?? "").trim()) return "pass"
  }
  throw new NexumModelProbeError("模型未返回文本响应")
}

async function probeFunctionCalling(model: ModelPort, signal: AbortSignal): Promise<"pass"> {
  for await (const chunk of model.prompt({
    sessionID: "model-probe",
    text: "请调用 read 工具读取 README.md",
    signal,
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
  throw new NexumModelProbeError("模型未返回 Function Calling 响应")
}

function assertMode(mode: string): asserts mode is NexumModelProbeMode {
  if (mode !== "text" && mode !== "function_calling" && mode !== "both") {
    throw new NexumModelProbeError("模型 Probe 模式无效")
  }
}

function normalizeTimeout(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(1, Math.floor(value))
}
