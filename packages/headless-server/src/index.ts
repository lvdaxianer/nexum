/**
 * 独立 Headless Service 的最小 HTTP 启动器与健康检查接口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

const DEFAULT_HOSTNAME = "127.0.0.1"
const DEFAULT_PORT = 4097
const TRACE_ID_HEADER = "x-trace-id"
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

/** Headless Service 的监听配置。 */
export interface HeadlessServerOptions {
  readonly hostname?: string
  readonly port?: number
}

/** 已启动的 Headless Service 控制句柄。 */
export interface HeadlessServer {
  readonly url: URL
  readonly stop: (closeActiveConnections?: boolean) => Promise<void>
}

/**
 * 启动不依赖 TUI、Desktop 或完整 App 的 Headless Service。
 *
 * @param options - 服务监听地址配置
 * @returns 服务地址与停止句柄
 * @throws 当端口不是 0 到 65535 的整数时抛出配置错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export async function startHeadlessServer(options: HeadlessServerOptions = {}): Promise<HeadlessServer> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME
  const port = options.port ?? DEFAULT_PORT
  assertPort(port)

  const server = Bun.serve({
    hostname,
    port,
    fetch: handleRequest,
  })

  return {
    url: server.url,
    stop: (closeActiveConnections = false) => server.stop(closeActiveConnections),
  }
}

/**
 * 处理 Headless Service 的健康检查与未知路径响应。
 *
 * @param request - 标准 Web 请求
 * @returns caller-safe HTTP 响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
function handleRequest(request: Request): Response {
  const traceId = traceIdFrom(request.headers.get(TRACE_ID_HEADER))
  const url = new URL(request.url)

  if (url.pathname === "/health/live" || url.pathname === "/health/ready") {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }

    const status = url.pathname === "/health/live" ? "ok" : "ready"
    return jsonResponse({ service: "headless-server", status }, traceId)
  }

  return errorResponse(404, "HEADLESS_ROUTE_NOT_FOUND", "请求路径不存在", traceId)
}

/**
 * 生成带链路标识的 JSON 响应。
 *
 * @param body - 安全的响应数据
 * @param traceId - 当前请求链路标识
 * @returns HTTP JSON 响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
function jsonResponse(body: object, traceId: string): Response {
  return Response.json(body, {
    headers: {
      "cache-control": "no-store",
      [TRACE_ID_HEADER]: traceId,
    },
  })
}

/**
 * 生成稳定且不泄露内部实现的错误响应。
 *
 * @param status - HTTP 状态码
 * @param errorCode - 机器可读错误码
 * @param message - 可直接展示给调用方的中文消息
 * @param traceId - 当前请求链路标识
 * @returns HTTP 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
function errorResponse(status: number, errorCode: string, message: string, traceId: string): Response {
  return Response.json(
    { errorCode, message, traceId },
    {
      status,
      headers: {
        "cache-control": "no-store",
        [TRACE_ID_HEADER]: traceId,
      },
    },
  )
}

/**
 * 校验服务端口，避免把无效配置交给底层监听器。
 *
 * @param port - 待校验端口
 * @throws 当端口不满足监听范围时抛出配置错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Headless Service 端口必须是 0 到 65535 的整数")
  }
}

/**
 * 校验并复用调用方链路标识，否则生成新的标识。
 *
 * @param value - 请求携带的链路标识
 * @returns 安全的链路标识
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
function traceIdFrom(value: string | null): string {
  const candidate = value?.trim()
  return candidate && TRACE_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID()
}
