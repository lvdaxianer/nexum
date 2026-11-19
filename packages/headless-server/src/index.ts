/**
 * 独立 Headless Service 的最小 HTTP 启动器与健康检查接口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import {
  HeadlessModelConfigError,
  HeadlessPermissionError,
  HeadlessQuestionError,
  HeadlessSessionError,
  createHeadlessConfiguredCodingLoop,
  createHeadlessModelConfigStore,
  createHeadlessPermissionBroker,
  createHeadlessQuestionPort,
  createHeadlessSessionService,
  createHeadlessToolRegistry,
  type HeadlessCodingLoop,
  type HeadlessModelConfigStore,
  type HeadlessPermissionBroker,
  type HeadlessQuestionPort,
  type HeadlessSessionService,
} from "@opencode/headless-core"
import { createHeadlessEventHub, type HeadlessEventHub } from "./events.ts"

const DEFAULT_HOSTNAME = "127.0.0.1"
const DEFAULT_PORT = 4097
const DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"] as const
const TRACE_ID_HEADER = "x-trace-id"
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

/** Headless Service 的监听配置。 */
export interface HeadlessServerOptions {
  readonly hostname?: string
  readonly port?: number
  readonly sessionService?: HeadlessSessionService
  readonly codingLoop?: HeadlessCodingLoop
  readonly permissionBroker?: HeadlessPermissionBroker
  readonly questionPort?: HeadlessQuestionPort
  readonly modelConfigStore?: HeadlessModelConfigStore
  readonly eventHub?: HeadlessEventHub
  readonly corsOrigins?: readonly string[]
  readonly idleTimeout?: number
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
  const sessionService = options.sessionService ?? createHeadlessSessionService()
  const modelConfigStore = options.modelConfigStore ?? createHeadlessModelConfigStore()
  const eventHub = options.eventHub ?? createHeadlessEventHub()
  const permissionBroker = options.permissionBroker ?? createHeadlessPermissionBroker()
  const questionPort = options.questionPort ?? createHeadlessQuestionPort()
  const toolRegistry = createHeadlessToolRegistry({ sessions: sessionService })
  const corsOrigins = options.corsOrigins ?? DEFAULT_CORS_ORIGINS
  const codingLoop =
    options.codingLoop ??
    createHeadlessConfiguredCodingLoop({
      modelConfig: modelConfigStore,
      permission: permissionBroker,
      sessions: sessionService,
      tool: toolRegistry.port,
      events: eventHub,
      tools: toolRegistry.definitions,
      question: questionPort,
    })
  assertPort(port)

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: options.idleTimeout ?? 0,
    fetch: async (request) => {
      if (request.method === "OPTIONS") return corsPreflight(request, corsOrigins)
      const response = await handleRequest(
        request,
        sessionService,
        eventHub,
        codingLoop,
        permissionBroker,
        questionPort,
        modelConfigStore,
      )
      return withCorsHeaders(response, request, corsOrigins)
    },
  })

  return {
    url: server.url,
    stop: (closeActiveConnections = false) => server.stop(closeActiveConnections),
  }
}

function corsPreflight(request: Request, origins: readonly string[]): Response {
  const origin = request.headers.get("origin")
  if (!origin || !isAllowedOrigin(origin, origins)) {
    return errorResponse(
      403,
      "HEADLESS_CORS_ORIGIN_NOT_ALLOWED",
      "请求来源不被允许",
      traceIdFrom(request.headers.get(TRACE_ID_HEADER)),
    )
  }
  const response = new Response(null, { status: 204 })
  return withCorsHeaders(response, request, origins)
}

function withCorsHeaders(response: Response, request: Request, origins: readonly string[]): Response {
  const headers = new Headers(response.headers)
  const origin = request.headers.get("origin")
  headers.set("vary", "origin")
  if (origin && isAllowedOrigin(origin, origins)) {
    headers.set("access-control-allow-origin", origin)
    headers.set("access-control-allow-methods", "GET, POST, PUT, OPTIONS")
    headers.set("access-control-allow-headers", "content-type, x-trace-id")
    headers.set("access-control-max-age", "300")
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function isAllowedOrigin(origin: string, origins: readonly string[]): boolean {
  return origins.some((allowedOrigin) => allowedOrigin.trim() === origin)
}

/**
 * 处理 Headless Service 的健康检查与未知路径响应。
 *
 * @param request - 标准 Web 请求
 * @returns caller-safe HTTP 响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function handleRequest(
  request: Request,
  sessionService: HeadlessSessionService,
  eventHub: HeadlessEventHub,
  codingLoop?: HeadlessCodingLoop,
  permissionBroker?: HeadlessPermissionBroker,
  questionPort?: HeadlessQuestionPort,
  modelConfigStore?: HeadlessModelConfigStore,
): Promise<Response> {
  const traceId = traceIdFrom(request.headers.get(TRACE_ID_HEADER))
  const url = new URL(request.url)

  if (url.pathname === "/health/live" || url.pathname === "/health/ready") {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }

    const status = url.pathname === "/health/live" ? "ok" : "ready"
    return jsonResponse({ service: "headless-server", status }, traceId)
  }

  if (url.pathname === "/api/experimental/headless/session") {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createSession(request, sessionService, traceId)
  }

  if (url.pathname === "/api/experimental/headless/model") {
    if (request.method === "GET") return getModelConfig(modelConfigStore, traceId)
    if (request.method === "PUT") return updateModelConfig(request, modelConfigStore, traceId)
    return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 或 PUT 请求", traceId)
  }

  const promptMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/prompt$/)
  if (promptMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createPrompt(request, decodeURIComponent(promptMatch[1]!), sessionService, codingLoop, traceId)
  }

  const cancelMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/cancel$/)
  if (cancelMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return cancelSession(decodeURIComponent(cancelMatch[1]!), sessionService, codingLoop, traceId)
  }

  const eventsMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/events$/)
  if (eventsMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return streamEvents(decodeURIComponent(eventsMatch[1]!), sessionService, eventHub, traceId)
  }

  const permissionListMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/permission$/)
  if (permissionListMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listPermissions(decodeURIComponent(permissionListMatch[1]!), sessionService, permissionBroker, traceId)
  }

  const permissionReplyMatch = url.pathname.match(
    /^\/api\/experimental\/headless\/session\/([^/]+)\/permission\/([^/]+)\/reply$/,
  )
  if (permissionReplyMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return replyPermission(
      request,
      decodeURIComponent(permissionReplyMatch[1]!),
      decodeURIComponent(permissionReplyMatch[2]!),
      sessionService,
      permissionBroker,
      traceId,
    )
  }

  const questionListMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/question$/)
  if (questionListMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listQuestions(decodeURIComponent(questionListMatch[1]!), sessionService, questionPort, traceId)
  }

  const questionReplyMatch = url.pathname.match(
    /^\/api\/experimental\/headless\/session\/([^/]+)\/question\/([^/]+)\/reply$/,
  )
  if (questionReplyMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return replyQuestion(
      request,
      decodeURIComponent(questionReplyMatch[1]!),
      decodeURIComponent(questionReplyMatch[2]!),
      sessionService,
      questionPort,
      traceId,
    )
  }

  const questionCancelMatch = url.pathname.match(
    /^\/api\/experimental\/headless\/session\/([^/]+)\/question\/([^/]+)\/cancel$/,
  )
  if (questionCancelMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return cancelQuestion(
      decodeURIComponent(questionCancelMatch[1]!),
      decodeURIComponent(questionCancelMatch[2]!),
      sessionService,
      questionPort,
      traceId,
    )
  }

  return errorResponse(404, "HEADLESS_ROUTE_NOT_FOUND", "请求路径不存在", traceId)
}

/**
 * 接受 Prompt 并异步启动 Headless Coding Loop。
 *
 * @param request - 标准 Web 请求
 * @param sessionID - 目标 Session ID
 * @param sessionService - Session 查询服务
 * @param codingLoop - 可选的 Coding Loop 适配器
 * @param traceId - 当前请求链路标识
 * @returns accepted 响应或 caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function createPrompt(
  request: Request,
  sessionID: string,
  sessionService: HeadlessSessionService,
  codingLoop: HeadlessCodingLoop | undefined,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  if (!codingLoop) {
    return errorResponse(503, "HEADLESS_RUNTIME_NOT_CONFIGURED", "Headless Runtime 尚未配置", traceId)
  }

  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.text !== "string" || payload.text.trim() === "") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "text 必须是非空字符串", traceId)
  }

  void codingLoop.run({ sessionID, text: payload.text }).catch(() => undefined)
  return jsonResponse({ data: { status: "accepted" } }, traceId)
}

/**
 * 请求取消指定 Session 的当前运行。
 *
 * @param sessionID - 目标 Session ID
 * @param sessionService - Session 查询与状态服务
 * @param codingLoop - 可选的 Coding Loop 取消适配器
 * @param traceId - 当前请求链路标识
 * @returns 取消结果或 caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function cancelSession(
  sessionID: string,
  sessionService: HeadlessSessionService,
  codingLoop: HeadlessCodingLoop | undefined,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  try {
    if (codingLoop) {
      await codingLoop.cancel(sessionID)
    } else if (session.status === "idle" || session.status === "running") {
      await sessionService.setStatus(sessionID, "cancelled")
    }
    return jsonResponse({ data: { status: "cancelled" } }, traceId)
  } catch (error) {
    if (error instanceof HeadlessSessionError && error.code === "session_not_found") {
      return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", error.message, traceId)
    }
    return errorResponse(409, "HEADLESS_SESSION_CANCEL_CONFLICT", "Session 当前状态不允许取消", traceId)
  }
}

/** 将指定 Session 的运行事件转换为 SSE 响应。 */
async function streamEvents(
  sessionID: string,
  sessionService: HeadlessSessionService,
  eventHub: HeadlessEventHub,
  traceId: string,
): Promise<Response> {
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  const encoder = new TextEncoder()
  const iterator = eventHub.subscribe(sessionID)[Symbol.asyncIterator]()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": headless-events-connected\n\n"))
      void (async () => {
        try {
          while (true) {
            const next = await iterator.next()
            if (next.done || closed) return
            controller.enqueue(encoder.encode(`id: ${next.value.sequence}\ndata: ${JSON.stringify(next.value)}\n\n`))
          }
        } catch {
          if (!closed) {
            closed = true
            controller.close()
          }
        }
      })()
    },
    cancel() {
      closed = true
      void iterator.return?.()
    },
  })
  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      [TRACE_ID_HEADER]: traceId,
    },
  })
}

/** 返回指定 Session 的待审批权限请求。 */
async function listPermissions(
  sessionID: string,
  sessionService: HeadlessSessionService,
  permissionBroker: HeadlessPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) {
    return errorResponse(503, "HEADLESS_PERMISSION_NOT_CONFIGURED", "Headless Permission 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  return jsonResponse({ data: await permissionBroker.list(sessionID) }, traceId)
}

/**
 * 处理权限审批回复。
 *
 * @param request - 标准 Web 请求
 * @param sessionID - 目标 Session ID
 * @param requestID - 待审批权限请求 ID
 * @param sessionService - Session 查询服务
 * @param permissionBroker - 权限审批 Broker
 * @param traceId - 当前请求链路标识
 * @returns 审批结果或 caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function replyPermission(
  request: Request,
  sessionID: string,
  requestID: string,
  sessionService: HeadlessSessionService,
  permissionBroker: HeadlessPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) {
    return errorResponse(503, "HEADLESS_PERMISSION_NOT_CONFIGURED", "Headless Permission 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.decision !== "string") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "decision 必须是有效的权限决策", traceId)
  }

  try {
    const decision = await permissionBroker.reply({
      sessionID,
      requestID,
      decision: payload.decision as "allow_once" | "allow_always" | "deny",
    })
    return jsonResponse({ data: { status: decision === "deny" ? "denied" : "approved" } }, traceId)
  } catch (error) {
    if (error instanceof HeadlessPermissionError && error.code === "not_found") {
      return errorResponse(404, "HEADLESS_PERMISSION_NOT_FOUND", error.message, traceId)
    }
    if (error instanceof HeadlessPermissionError && error.code === "session_mismatch") {
      return errorResponse(409, "HEADLESS_PERMISSION_SESSION_MISMATCH", error.message, traceId)
    }
    if (error instanceof HeadlessPermissionError && error.code === "invalid_decision") {
      return errorResponse(400, "HEADLESS_INVALID_REQUEST", error.message, traceId)
    }
    return errorResponse(500, "HEADLESS_PERMISSION_REPLY_FAILED", "权限审批失败", traceId)
  }
}

/** 返回指定 Session 的待回答 Question。 */
async function listQuestions(
  sessionID: string,
  sessionService: HeadlessSessionService,
  questionPort: HeadlessQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "HEADLESS_QUESTION_NOT_CONFIGURED", "Headless Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  return jsonResponse({ data: await questionPort.list(sessionID) }, traceId)
}

/** 接收 Question 的结构化回答并唤醒阻塞的 Coding Loop。 */
async function replyQuestion(
  request: Request,
  sessionID: string,
  requestID: string,
  sessionService: HeadlessSessionService,
  questionPort: HeadlessQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "HEADLESS_QUESTION_NOT_CONFIGURED", "Headless Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.answers) ||
    !payload.answers.every((answers) => Array.isArray(answers) && answers.every((answer) => typeof answer === "string"))
  ) {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "answers 必须是二维字符串数组", traceId)
  }

  try {
    const result = await questionPort.reply(sessionID, requestID, payload.answers as string[][])
    if (!result.ok) return errorResponse(409, "HEADLESS_QUESTION_CANCELLED", result.output, traceId)
    return jsonResponse({ data: { status: "answered" } }, traceId)
  } catch (error) {
    return questionErrorResponse(error, traceId)
  }
}

/** 取消 pending Question，不生成伪造答案。 */
async function cancelQuestion(
  sessionID: string,
  requestID: string,
  sessionService: HeadlessSessionService,
  questionPort: HeadlessQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "HEADLESS_QUESTION_NOT_CONFIGURED", "Headless Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  try {
    await questionPort.cancel(sessionID, requestID)
    return jsonResponse({ data: { status: "cancelled" } }, traceId)
  } catch (error) {
    return questionErrorResponse(error, traceId)
  }
}

function questionErrorResponse(error: unknown, traceId: string): Response {
  if (error instanceof HeadlessQuestionError && error.code === "not_found") {
    return errorResponse(404, "HEADLESS_QUESTION_NOT_FOUND", error.message, traceId)
  }
  if (error instanceof HeadlessQuestionError && error.code === "session_mismatch") {
    return errorResponse(409, "HEADLESS_QUESTION_SESSION_MISMATCH", error.message, traceId)
  }
  if (error instanceof HeadlessQuestionError && error.code === "invalid_answers") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", error.message, traceId)
  }
  return errorResponse(500, "HEADLESS_QUESTION_FAILED", "Question 操作失败", traceId)
}

/**
 * 处理 Headless Session 创建请求。
 *
 * @param request - 标准 Web 请求
 * @param sessionService - Session 创建与状态服务
 * @param traceId - 当前请求链路标识
 * @returns Session 数据或 caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function createSession(
  request: Request,
  sessionService: HeadlessSessionService,
  traceId: string,
): Promise<Response> {
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.directory !== "string" || payload.directory.trim() === "") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "directory 必须是非空字符串", traceId)
  }

  try {
    const session = await sessionService.create({ directory: payload.directory })
    return jsonResponse(
      {
        data: {
          id: session.sessionID,
          directory: session.directory,
          status: session.status,
        },
      },
      traceId,
    )
  } catch (error) {
    if (error instanceof HeadlessSessionError && error.code === "invalid_directory") {
      return errorResponse(400, "HEADLESS_INVALID_DIRECTORY", error.message, traceId)
    }
    return errorResponse(500, "HEADLESS_SESSION_CREATE_FAILED", "Session 创建失败", traceId)
  }
}

/** 返回当前模型配置的安全视图。 */
async function getModelConfig(
  modelConfigStore: HeadlessModelConfigStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelConfigStore) {
    return errorResponse(503, "HEADLESS_MODEL_CONFIG_NOT_CONFIGURED", "Headless Model Config 尚未配置", traceId)
  }
  return jsonResponse({ data: await modelConfigStore.get() }, traceId)
}

/** 更新并校验当前模型配置，错误时保留旧配置。 */
async function updateModelConfig(
  request: Request,
  modelConfigStore: HeadlessModelConfigStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelConfigStore) {
    return errorResponse(503, "HEADLESS_MODEL_CONFIG_NOT_CONFIGURED", "Headless Model Config 尚未配置", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    typeof payload.baseUrl !== "string" ||
    typeof payload.model !== "string" ||
    (payload.credential !== undefined && typeof payload.credential !== "string") ||
    (payload.credentialRef !== undefined && typeof payload.credentialRef !== "string")
  ) {
    return errorResponse(400, "HEADLESS_INVALID_MODEL_CONFIG", "模型配置字段无效", traceId)
  }

  try {
    const config = await modelConfigStore.update({
      baseUrl: payload.baseUrl,
      model: payload.model,
      ...(payload.credential !== undefined ? { credential: payload.credential } : {}),
      ...(payload.credentialRef !== undefined ? { credentialRef: payload.credentialRef } : {}),
    })
    return jsonResponse({ data: config }, traceId)
  } catch (error) {
    if (error instanceof HeadlessModelConfigError) {
      return errorResponse(400, "HEADLESS_INVALID_MODEL_CONFIG", error.message, traceId)
    }
    return errorResponse(500, "HEADLESS_MODEL_CONFIG_UPDATE_FAILED", "模型配置保存失败", traceId)
  }
}

/** 判断 JSON payload 是否为非数组对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
