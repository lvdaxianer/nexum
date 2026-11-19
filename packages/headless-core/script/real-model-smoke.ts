import {
  createHeadlessModelConfigStore,
  createOpenAICompatibleModelPort,
  type HeadlessFetch,
  type ModelChunk,
} from "../src/index.ts"

/** 真实模型 smoke 的最小环境输入。 */
export interface RealModelSmokeEnvironment {
  readonly baseUrl?: string
  readonly model?: string
  readonly apiKey?: string
  readonly mode?: string
}

/** 真实模型 smoke 的安全结果摘要。 */
export interface RealModelSmokeResult {
  readonly text: "pass" | "skipped"
  readonly functionCalling: "pass" | "skipped"
  readonly endpointCalls: number
}

/**
 * 运行不输出模型内容和凭据的 OpenAI-compatible smoke。
 *
 * @param environment - 从环境变量读取的端点、模型和 API Key
 * @param fetcher - 可替换 HTTP 端口，供离线测试使用
 * @returns 仅包含能力状态和请求次数的摘要
 */
export async function runRealModelSmoke(
  environment: RealModelSmokeEnvironment = {
    baseUrl: process.env.HEADLESS_MODEL_BASE_URL,
    model: process.env.HEADLESS_MODEL,
    apiKey: process.env.HEADLESS_MODEL_API_KEY,
    mode: process.env.HEADLESS_MODEL_SMOKE_MODE,
  },
  fetcher?: HeadlessFetch,
): Promise<RealModelSmokeResult> {
  const baseUrl = environment.baseUrl?.trim()
  const modelName = environment.model?.trim()
  const apiKey = environment.apiKey?.trim()
  if (!baseUrl || !modelName || !apiKey) {
    throw new Error("缺少 HEADLESS_MODEL_BASE_URL、HEADLESS_MODEL 或 HEADLESS_MODEL_API_KEY")
  }
  const mode = environment.mode?.trim() || "both"
  if (mode !== "text" && mode !== "tool" && mode !== "both") {
    throw new Error("HEADLESS_MODEL_SMOKE_MODE 必须是 text、tool 或 both")
  }

  const config = createHeadlessModelConfigStore()
  await config.update({ baseUrl, model: modelName, credential: apiKey })
  let endpointCalls = 0
  const request = fetcher ?? fetch
  const countedFetcher: HeadlessFetch = async (input, init) => {
    endpointCalls += 1
    return request(input, init)
  }
  const model = createOpenAICompatibleModelPort({ config, fetch: countedFetcher })
  const text = mode === "tool" ? "skipped" : await assertTextResponse(model)
  const functionCalling = mode === "text" ? "skipped" : await assertFunctionCalling(model)
  return { text, functionCalling, endpointCalls }
}

async function assertTextResponse(model: ReturnType<typeof createOpenAICompatibleModelPort>): Promise<"pass"> {
  const chunks = await collect(model, "请只返回一句简短文本，不要调用工具")
  if (!chunks.some((chunk) => chunk.type === "text")) throw new Error("真实模型未返回文本响应")
  return "pass"
}

async function assertFunctionCalling(model: ReturnType<typeof createOpenAICompatibleModelPort>): Promise<"pass"> {
  const chunks = await collect(model, "请调用 read_file 读取 README.md", true)
  const toolCall = chunks.find((chunk) => chunk.type === "tool-call")
  if (!toolCall) throw new Error("真实模型未返回 Function Calling 响应")
  return "pass"
}

async function collect(
  model: ReturnType<typeof createOpenAICompatibleModelPort>,
  text: string,
  withTool = false,
): Promise<ModelChunk[]> {
  const chunks: ModelChunk[] = []
  for await (const chunk of model.prompt({
    sessionID: "real-model-smoke",
    text,
    ...(withTool
      ? {
          tools: [
            {
              name: "read_file",
              description: "读取当前工作目录内的文件",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          ],
        }
      : {}),
  })) {
    chunks.push(chunk)
  }
  return chunks
}

if (import.meta.main) {
  runRealModelSmoke()
    .then((result) => {
      console.log(
        `real-model-smoke: text=${result.text} function_calling=${result.functionCalling} endpoint_calls=${result.endpointCalls}`,
      )
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "真实模型 smoke 失败")
      process.exitCode = 1
    })
}
