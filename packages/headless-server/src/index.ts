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
  HeadlessModelError,
  HeadlessModelProbeError,
  HeadlessSkillInvocationError,
  createHeadlessConfiguredCodingLoop,
  createHeadlessModelProbePort,
  createOpenAICompatibleModelPort,
  createHeadlessModelConfigStore,
  createHeadlessPermissionBroker,
  createHeadlessQuestionPort,
  createHeadlessSessionService,
  createHeadlessSkillInvocationPort,
  createHeadlessSkillRegistry,
  createHeadlessToolRegistry,
  type HeadlessCodingLoop,
  type HeadlessModelConfigStore,
  type HeadlessPermissionBroker,
  type HeadlessQuestionPort,
  type HeadlessModelProbeMode,
  type HeadlessModelProbePort,
  type HeadlessSessionService,
  type SessionStore,
  type HeadlessSkillInvocationPort,
  type HeadlessSkillRegistry,
} from "@opencode/headless-core"
import { resolve } from "node:path"
import { createHeadlessEventHub, type HeadlessEventHub } from "./events.ts"

const DEFAULT_HOSTNAME = "127.0.0.1"
const DEFAULT_PORT = 4097
const DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"] as const
const TRACE_ID_HEADER = "x-trace-id"
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const HEADLESS_PROTOCOL_VERSION = "headless.v1"
const HEADLESS_FEATURES = [
  "model",
  "session",
  "prompt",
  "permission",
  "question",
  "context_compaction",
  "project_context",
  "skill",
] as const
const HEADLESS_EVENT_TYPES = [
  "assistant.text",
  "tool.request",
  "tool.result",
  "permission.requested",
  "question.request",
  "question.result",
  "question.cancelled",
  "context.compaction.started",
  "context.compaction.completed",
  "context.compaction.failed",
  "context.project.loaded",
  "skill.activated",
  "skill.failed",
  "session.completed",
  "session.failed",
  "session.cancelled",
] as const

/** Headless Service 的监听配置。 */
export interface HeadlessServerOptions {
  readonly hostname?: string
  readonly port?: number
  readonly sessionService?: HeadlessSessionService
  readonly sessionStore?: SessionStore
  readonly codingLoop?: HeadlessCodingLoop
  readonly permissionBroker?: HeadlessPermissionBroker
  readonly questionPort?: HeadlessQuestionPort
  readonly modelProbe?: HeadlessModelProbePort
  readonly modelConfigStore?: HeadlessModelConfigStore
  readonly skillRegistry?: HeadlessSkillRegistry
  readonly skillInvocation?: HeadlessSkillInvocationPort
  readonly skillRoots?: readonly string[]
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
  const sessionService = options.sessionService ?? createHeadlessSessionService({ store: options.sessionStore })
  const modelConfigStore = options.modelConfigStore ?? createHeadlessModelConfigStore()
  const modelProbe =
    options.modelProbe ??
    createHeadlessModelProbePort({ model: createOpenAICompatibleModelPort({ config: modelConfigStore }) })
  const eventHub = options.eventHub ?? createHeadlessEventHub()
  const permissionBroker = options.permissionBroker ?? createHeadlessPermissionBroker()
  const questionPort = options.questionPort ?? createHeadlessQuestionPort()
  const skillRegistry =
    options.skillRegistry ??
    createHeadlessSkillRegistry({ roots: options.skillRoots ?? [resolve(process.cwd(), "skills")] })
  await skillRegistry.refresh()
  const skillInvocation =
    options.skillInvocation ??
    createHeadlessSkillInvocationPort({ registry: skillRegistry, permission: permissionBroker })
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
      skills: skillInvocation,
    })
  assertPort(port)
  if (options.sessionStore) await options.sessionStore.list()

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: options.idleTimeout ?? 0,
    fetch: async (request) => {
      if (request.method === "OPTIONS") return corsPreflight(request, corsOrigins)
      try {
        const response = await handleRequest(
          request,
          sessionService,
          eventHub,
          codingLoop,
          permissionBroker,
          questionPort,
          modelConfigStore,
          modelProbe,
          skillRegistry,
          skillInvocation,
        )
        return withCorsHeaders(response, request, corsOrigins)
      } catch (error) {
        const traceId = traceIdFrom(request.headers.get(TRACE_ID_HEADER))
        logRequestFailure(request, traceId, error)
        return withCorsHeaders(
          errorResponse(500, "HEADLESS_INTERNAL_ERROR", "Headless Service 暂时不可用", traceId),
          request,
          corsOrigins,
        )
      }
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
    headers.set("access-control-allow-headers", "content-type, x-trace-id, last-event-id")
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
  modelProbe?: HeadlessModelProbePort,
  skillRegistry?: HeadlessSkillRegistry,
  skillInvocation?: HeadlessSkillInvocationPort,
): Promise<Response> {
  const traceId = traceIdFrom(request.headers.get(TRACE_ID_HEADER))
  const url = new URL(request.url)

  if (url.pathname === "/health/live" || url.pathname === "/health/ready") {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }

    const status = url.pathname === "/health/live" ? "ok" : "ready"
    return jsonResponse({ service: "headless-server", status }, traceId, false)
  }

  if (url.pathname === "/api/experimental/headless/capabilities") {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return jsonResponse(
      {
        data: {
          protocolVersion: HEADLESS_PROTOCOL_VERSION,
          transport: { http: "json", events: "sse" },
          features: [...HEADLESS_FEATURES],
          eventTypes: [...HEADLESS_EVENT_TYPES],
        },
      },
      traceId,
    )
  }

  if (url.pathname === "/api/experimental/headless/session") {
    if (request.method === "GET") return listSessions(sessionService, traceId)
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createSession(request, sessionService, traceId)
  }

  const updateSessionMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)$/)
  if (updateSessionMatch) {
    if (request.method !== "PUT") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 PUT 请求", traceId)
    }
    return updateSession(request, decodeURIComponent(updateSessionMatch[1]!), sessionService, traceId)
  }

  if (url.pathname === "/api/experimental/headless/model") {
    if (request.method === "GET") return getModelConfig(modelConfigStore, traceId)
    if (request.method === "PUT") return updateModelConfig(request, modelConfigStore, traceId)
    return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 或 PUT 请求", traceId)
  }

  if (url.pathname === "/api/experimental/headless/model/probe") {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return probeModel(request, modelProbe, traceId)
  }

  if (url.pathname === "/api/experimental/headless/skills") {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listSkills(skillRegistry, traceId)
  }

  if (url.pathname === "/api/experimental/headless/skills/register") {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return registerSkill(request, skillRegistry, traceId)
  }

  if (url.pathname === "/api/experimental/headless/skills/refresh") {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return refreshSkills(skillRegistry, traceId)
  }

  if (url.pathname === "/api/experimental/headless/skills/validate") {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return validateSkills(request, skillRegistry, traceId)
  }

  const skillActivateMatch = url.pathname.match(/^\/api\/experimental\/headless\/skills\/([^/]+)\/activate$/)
  if (skillActivateMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return activateSkill(request, decodeURIComponent(skillActivateMatch[1]!), sessionService, skillInvocation, traceId)
  }

  const skillDetailMatch = url.pathname.match(/^\/api\/experimental\/headless\/skills\/([^/]+)$/)
  if (skillDetailMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return detailSkill(decodeURIComponent(skillDetailMatch[1]!), skillRegistry, traceId)
  }

  const promptMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/prompt$/)
  if (promptMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createPrompt(request, decodeURIComponent(promptMatch[1]!), sessionService, codingLoop, traceId)
  }

  const stateMatch = url.pathname.match(/^\/api\/experimental\/headless\/session\/([^/]+)\/state$/)
  if (stateMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "HEADLESS_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return getSessionState(
      decodeURIComponent(stateMatch[1]!),
      sessionService,
      permissionBroker,
      questionPort,
      eventHub,
      traceId,
    )
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
    return streamEvents(
      decodeURIComponent(eventsMatch[1]!),
      sessionService,
      eventHub,
      request.headers.get("last-event-id") ?? url.searchParams.get("after"),
      traceId,
    )
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
 * 返回项目 Skill root 中的安全摘要。
 *
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns Skill 摘要响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function listSkills(skillRegistry: HeadlessSkillRegistry | undefined, traceId: string): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  return jsonResponse({ data: await skillRegistry.list() }, traceId)
}

/**
 * 返回一个 Skill 的安全详情，不暴露宿主绝对路径。
 *
 * @param skillID - Skill ID
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns Skill 详情或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function detailSkill(
  skillID: string,
  skillRegistry: HeadlessSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const summary = (await skillRegistry.list()).find((item) => item.id === skillID)
  return summary
    ? jsonResponse({ data: summary }, traceId)
    : errorResponse(404, "HEADLESS_SKILL_NOT_FOUND", "Skill 不存在", traceId)
}

/**
 * 按 ID 幂等注册已存在于配置 root 的 Skill。
 *
 * @param request - 注册请求
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns 注册后的 Skill 摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function registerSkill(
  request: Request,
  skillRegistry: HeadlessSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.id !== "string" || payload.id.trim() === "") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "id 必须是非空字符串", traceId)
  }
  await skillRegistry.refresh()
  return detailSkill(payload.id, skillRegistry, traceId)
}

/**
 * 重新扫描配置 Skill root 并返回最新摘要。
 *
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns 最新 Skill 摘要数组
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function refreshSkills(skillRegistry: HeadlessSkillRegistry | undefined, traceId: string): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  await skillRegistry.refresh()
  return listSkills(skillRegistry, traceId)
}

/**
 * 校验全部 Skill 或指定 ID 的安全状态。
 *
 * @param request - 校验请求
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns 校验结果和安全摘要
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function validateSkills(
  request: Request,
  skillRegistry: HeadlessSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => ({}))
  if (!isRecord(payload) || (payload.id !== undefined && typeof payload.id !== "string")) {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "id 必须是字符串", traceId)
  }
  const summaries = await skillRegistry.list()
  const data = payload.id === undefined ? summaries : summaries.filter((item) => item.id === payload.id)
  return jsonResponse(
    { data: { valid: data.length > 0 && data.every((item) => item.status === "ready"), data } },
    traceId,
  )
}

/**
 * 通过 Core Skill InvocationPort 激活指定 Skill。
 *
 * @param request - 激活请求
 * @param skillID - 路径中的 Skill ID
 * @param sessionService - Session 查询服务
 * @param skillInvocation - Core Skill 激活端口
 * @param traceId - 当前请求链路标识
 * @returns Prompt attachment 或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
async function activateSkill(
  request: Request,
  skillID: string,
  sessionService: HeadlessSessionService,
  skillInvocation: HeadlessSkillInvocationPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillInvocation) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.sessionID !== "string" || typeof payload.text !== "string") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "sessionID 和 text 必须是字符串", traceId)
  }
  if (!(await sessionService.get(payload.sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  try {
    const text = ensureSkillMention(payload.text, skillID)
    const prompt = await skillInvocation.resolve({ sessionID: payload.sessionID, text })
    return jsonResponse({ data: prompt }, traceId)
  } catch (error) {
    return skillInvocationErrorResponse(error, traceId)
  }
}

/**
 * 确保显式激活接口不会意外激活其它 Skill。
 *
 * @param text - 调用方 Prompt
 * @param skillID - 路径中的 Skill ID
 * @returns 至少包含目标 Skill mention 的 Prompt
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function ensureSkillMention(text: string, skillID: string): string {
  return text.includes(`@${skillID}`) ? text : `${text.trim()} @${skillID}`.trim()
}

/**
 * 把 Core Skill 激活错误转换为稳定 HTTP 错误。
 *
 * @param error - Core 端口抛出的错误
 * @param traceId - 当前请求链路标识
 * @returns caller-safe HTTP 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function skillInvocationErrorResponse(error: unknown, traceId: string): Response {
  if (!(error instanceof HeadlessSkillInvocationError)) {
    return errorResponse(500, "HEADLESS_SKILL_ACTIVATION_FAILED", "Skill 激活失败", traceId)
  }
  if (error.code === "skill_not_found") {
    return errorResponse(404, "HEADLESS_SKILL_NOT_FOUND", error.message, traceId)
  }
  if (error.code === "skill_not_ready") {
    return errorResponse(409, "HEADLESS_SKILL_NOT_READY", error.message, traceId)
  }
  return errorResponse(409, "HEADLESS_SKILL_PERMISSION_DENIED", error.message, traceId)
}

/**
 * 统一返回 Skill Registry 未配置的服务错误。
 *
 * @param traceId - 当前请求链路标识
 * @returns 服务不可用响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
function skillRegistryUnavailable(traceId: string): Response {
  return errorResponse(503, "HEADLESS_SKILL_REGISTRY_NOT_CONFIGURED", "Headless Skill Registry 尚未配置", traceId)
}

/** 返回所有可供页面恢复的 Headless Session。 */
async function listSessions(sessionService: HeadlessSessionService, traceId: string): Promise<Response> {
  const data = (await sessionService.list()).map((session) => ({
    id: session.sessionID,
    name: session.name,
    directory: session.directory,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }))
  return jsonResponse({ data }, traceId)
}

/** 执行安全模型能力 Probe，只返回能力状态。 */
async function probeModel(
  request: Request,
  modelProbe: HeadlessModelProbePort | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelProbe) return errorResponse(503, "HEADLESS_MODEL_PROBE_NOT_CONFIGURED", "模型 Probe 尚未配置", traceId)
  const payload = await request.json().catch(() => undefined)
  const mode = isRecord(payload) && payload.mode !== undefined ? payload.mode : "both"
  if (mode !== "text" && mode !== "function_calling" && mode !== "both") {
    return errorResponse(400, "HEADLESS_INVALID_MODEL_PROBE", "模型 Probe 模式无效", traceId)
  }

  try {
    const data = await modelProbe.probe({ mode: mode as HeadlessModelProbeMode })
    return jsonResponse({ data }, traceId)
  } catch (error) {
    if (error instanceof HeadlessModelError && error.code === "authentication_failed") {
      return errorResponse(401, "HEADLESS_MODEL_AUTH_FAILED", "模型认证失败", traceId)
    }
    if (error instanceof HeadlessModelProbeError || error instanceof HeadlessModelError) {
      return errorResponse(503, "HEADLESS_MODEL_PROBE_FAILED", error.message, traceId)
    }
    return errorResponse(503, "HEADLESS_MODEL_PROBE_FAILED", "模型 Probe 失败", traceId)
  }
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
  afterEventID: string | null,
  traceId: string,
): Promise<Response> {
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  const encoder = new TextEncoder()
  const iterator = eventHub.subscribe(sessionID, afterEventID ? { afterEventID } : undefined)[Symbol.asyncIterator]()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": headless-events-connected\n\n"))
      void (async () => {
        try {
          while (true) {
            const next = await iterator.next()
            if (next.done || closed) return
            const eventID = next.value.eventID ?? `${next.value.sessionID}:${next.value.sequence}`
            controller.enqueue(
              encoder.encode(
                `event: ${next.value.type}\nid: ${eventID}\ndata: ${JSON.stringify({
                  ...next.value,
                  eventID,
                  runID: next.value.runID ?? "unknown",
                  occurredAt: next.value.occurredAt ?? new Date().toISOString(),
                })}\n\n`,
              ),
            )
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

/** 返回页面刷新和断线恢复所需的安全 Session 快照。 */
async function getSessionState(
  sessionID: string,
  sessionService: HeadlessSessionService,
  permissionBroker: HeadlessPermissionBroker | undefined,
  questionPort: HeadlessQuestionPort | undefined,
  eventHub: HeadlessEventHub,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", "Session 不存在", traceId)
  const [pendingPermissions, pendingQuestions] = await Promise.all([
    permissionBroker?.list(sessionID) ?? [],
    questionPort?.list(sessionID) ?? [],
  ])
  return jsonResponse(
    {
      data: {
        session: {
          id: session.sessionID,
          name: session.name,
          directory: session.directory,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        pendingPermissions,
        pendingQuestions,
        lastSequence: eventHub.lastSequence(sessionID),
      },
    },
    traceId,
  )
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
  if (
    !isRecord(payload) ||
    typeof payload.directory !== "string" ||
    payload.directory.trim() === "" ||
    (payload.name !== undefined && typeof payload.name !== "string")
  ) {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "directory 必须是非空字符串", traceId)
  }

  try {
    const session = await sessionService.create({
      directory: payload.directory,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
    })
    return jsonResponse(
      {
        data: {
          id: session.sessionID,
          name: session.name,
          directory: session.directory,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
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

/**
 * 更新 Headless Session 的展示名称。
 *
 * @param request - 包含新名称的 JSON 请求
 * @param sessionID - 待更新的 Session ID
 * @param sessionService - Session 创建与状态服务
 * @param traceId - 当前请求链路标识
 * @returns 更新后的 Session 或 caller-safe 错误响应
 */
async function updateSession(
  request: Request,
  sessionID: string,
  sessionService: HeadlessSessionService,
  traceId: string,
): Promise<Response> {
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.name !== "string") {
    return errorResponse(400, "HEADLESS_INVALID_REQUEST", "name 必须是字符串", traceId)
  }

  try {
    const session = await sessionService.update(sessionID, { name: payload.name })
    return jsonResponse(
      {
        data: {
          id: session.sessionID,
          name: session.name,
          directory: session.directory,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      },
      traceId,
    )
  } catch (error) {
    if (error instanceof HeadlessSessionError && error.code === "session_not_found") {
      return errorResponse(404, "HEADLESS_SESSION_NOT_FOUND", error.message, traceId)
    }
    if (error instanceof HeadlessSessionError && error.code === "invalid_name") {
      return errorResponse(400, "HEADLESS_INVALID_REQUEST", error.message, traceId)
    }
    return errorResponse(500, "HEADLESS_SESSION_UPDATE_FAILED", "Session 更新失败", traceId)
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
function jsonResponse(body: object, traceId: string, includeMeta = true): Response {
  return Response.json(
    {
      ...body,
      ...(includeMeta
        ? {
            meta: {
              protocolVersion: HEADLESS_PROTOCOL_VERSION,
              traceId,
            },
          }
        : {}),
    },
    {
      headers: {
        "cache-control": "no-store",
        [TRACE_ID_HEADER]: traceId,
      },
    },
  )
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
    {
      errorCode,
      message,
      traceId,
      meta: {
        protocolVersion: HEADLESS_PROTOCOL_VERSION,
        traceId,
      },
    },
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

/** 记录统一 HTTP 异常边界的安全诊断上下文，同时保持响应 caller-safe。 */
function logRequestFailure(request: Request, traceId: string, error: unknown): void {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) }
  console.error("headless.request_failed", {
    traceId,
    method: request.method,
    path: new URL(request.url).pathname,
    error: details,
  })
}
