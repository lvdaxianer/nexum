/**
 * 独立 Nexum Service 的最小 HTTP 启动器与健康检查接口。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { createEmbeddedRuntime, type NexumDefaultRuntime } from "@nexum/application"
import {
  NexumModelConfigError,
  NexumPermissionError,
  NexumPermissionPolicyError,
  NexumQuestionError,
  NexumSessionError,
  NexumRunError,
  NexumModelError,
  NexumModelProbeError,
  NexumRolePromptError,
  NexumSkillInvocationError,
  McpError,
  nexumAnyToolAction,
  redactNexumSensitiveValue,
  type NexumCodingLoop,
  type NexumModelConfigStore,
  type NexumPermissionBroker,
  type NexumPermissionPolicyStore,
  type NexumQuestionPort,
  type NexumRolePromptStore,
  type NexumModelProbeMode,
  type NexumModelProbePort,
  type NexumSessionService,
  type SessionRecord,
  type SessionStore,
  type NexumSkillInvocationPort,
  type NexumSkillRegistry,
  type MessageStore,
  type ModelMessage,
  type NexumInteractionStore,
  type McpPort,
  type McpOAuthControlPort,
  type McpRegistry,
  type McpServerConfig,
} from "@nexum/core"
import {
  NEXUM_EVENT_TYPES,
  NEXUM_EXPERIMENTAL_API_PREFIX,
  type NexumMessage,
  type NexumSessionMessages,
} from "@nexum/protocol"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import type { NexumEventHub } from "./events.ts"

const DEFAULT_HOSTNAME = "127.0.0.1"
const DEFAULT_PORT = 4097
const DEFAULT_CORS_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"] as const
const TRACE_ID_HEADER = "x-trace-id"
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const NEXUM_PROTOCOL_VERSION = "nexum.runtime.v1"
const NEXUM_FEATURES = [
  "model",
  "session",
  "prompt",
  "permission",
  "permission_policy",
  "question",
  "context_compaction",
  "project_context",
  "skill",
  "role_prompt",
  "mcp",
] as const
const NEXUM_CAPABILITIES = [
  { id: "model", version: "1", status: "enabled", operations: ["prompt"] },
  { id: "tool", version: "1", status: "enabled", operations: ["execute"] },
  { id: "permission", version: "1", status: "enabled", operations: ["evaluate"] },
  { id: "interaction", version: "1", status: "enabled", operations: ["request", "reply"] },
  { id: "session", version: "1", status: "enabled", operations: ["create", "list", "get", "update", "delete", "continue"] },
  { id: "context", version: "1", status: "enabled", operations: ["load", "compact"] },
  { id: "skill", version: "1", status: "enabled", operations: ["list", "detail", "register", "refresh", "validate", "unregister", "activate"] },
  { id: "role_prompt", version: "1", status: "enabled", operations: ["get", "update", "reset"] },
  { id: "memory", version: "1", status: "disabled", operations: ["search", "upsert", "remove"] },
  { id: "mcp", version: "1", status: "disabled", operations: ["listServers", "listTools", "listResources", "listPrompts", "callTool", "authorize", "authorizationStatus", "completeAuthorization", "cancelAuthorization"] },
  { id: "host", version: "1", status: "enabled", operations: ["readText", "writeText", "runShell"] },
  { id: "event", version: "1", status: "enabled", operations: ["publish"] },
] as const

/** Nexum Service 的监听配置。 */
export interface NexumServerOptions {
  readonly hostname?: string
  readonly port?: number
  readonly runtime?: NexumDefaultRuntime
  readonly sessionService?: NexumSessionService
  readonly sessionStore?: SessionStore
  readonly messageStore?: MessageStore
  readonly interactionStore?: NexumInteractionStore
  readonly codingLoop?: NexumCodingLoop
  readonly permissionBroker?: NexumPermissionBroker
  /**
   * 权限策略 Store；仅在未注入 `permissionBroker` 时生效。
   *
   * 注入 Broker 时以 Broker 自带的 `policy` 为准，避免同一服务出现两份策略来源。
   */
  readonly permissionPolicyStore?: NexumPermissionPolicyStore
  readonly questionPort?: NexumQuestionPort
  readonly modelProbe?: NexumModelProbePort
  readonly modelConfigStore?: NexumModelConfigStore
  readonly rolePromptStore?: NexumRolePromptStore
  readonly rolePromptFile?: string
  readonly skillRegistry?: NexumSkillRegistry
  readonly skillRegistryFile?: string
  readonly skillInvocation?: NexumSkillInvocationPort
  readonly skillRoots?: readonly string[]
  readonly mcp?: McpRegistry
  readonly mcpOAuth?: McpOAuthControlPort
  readonly eventHub?: NexumEventHub
  readonly corsOrigins?: readonly string[]
  readonly idleTimeout?: number
}

/** 已启动的 Nexum Service 控制句柄。 */
export interface NexumServer {
  readonly url: URL
  readonly stop: (closeActiveConnections?: boolean) => Promise<void>
}

/**
 * 启动不依赖 TUI、Desktop 或完整 App 的 Nexum Service。
 *
 * @param options - 服务监听地址配置
 * @returns 服务地址与停止句柄
 * @throws 当端口不是 0 到 65535 的整数时抛出配置错误
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
export async function startNexumServer(options: NexumServerOptions = {}): Promise<NexumServer> {
  const hostname = options.hostname ?? DEFAULT_HOSTNAME
  const port = options.port ?? DEFAULT_PORT
  const interactionStore = options.interactionStore
  const runtime = options.runtime ?? createEmbeddedRuntime({
    ...(options.sessionService ? { sessions: options.sessionService } : {}),
    ...(options.sessionStore ? { sessionStore: options.sessionStore } : {}),
    ...(options.modelConfigStore ? { modelConfig: options.modelConfigStore } : {}),
    ...(options.rolePromptStore ? { rolePrompt: options.rolePromptStore } : {}),
    ...(options.rolePromptFile ? { rolePromptFile: options.rolePromptFile } : {}),
    ...(options.messageStore ? { messageStore: options.messageStore } : {}),
    ...(interactionStore ? { interactionStore } : {}),
    ...(options.eventHub ? { eventHub: options.eventHub } : {}),
    ...(options.permissionBroker ? { permissionBroker: options.permissionBroker } : {}),
    ...(options.permissionPolicyStore ? { permissionPolicyStore: options.permissionPolicyStore } : {}),
    ...(options.questionPort ? { questionPort: options.questionPort } : {}),
    ...(options.modelProbe ? { modelProbe: options.modelProbe } : {}),
    ...(options.skillRegistry ? { skillRegistry: options.skillRegistry } : {}),
    ...(options.skillRegistryFile ? { skillRegistryFile: options.skillRegistryFile } : {}),
    ...(options.skillInvocation ? { skillInvocation: options.skillInvocation } : {}),
    ...(options.codingLoop ? { codingLoop: options.codingLoop } : {}),
    ...(options.mcp ? { mcp: options.mcp } : {}),
    ...(options.mcpOAuth ? { mcpOAuth: options.mcpOAuth } : {}),
    skillRoots: options.skillRoots ?? [resolve(process.cwd(), "skills")],
  })
  const ownsRuntime = options.runtime === undefined
  const sessionService = runtime.sessionService
  const messageStore = runtime.messageStore
  const runtimeInteractionStore = runtime.interactionStore
  const modelConfigStore = runtime.modelConfig
  const rolePromptStore = runtime.rolePrompt
  const modelProbe = runtime.modelProbe
  const eventHub = runtime.eventHub
  const permissionBroker = runtime.permissionBroker
  const questionPort = runtime.questionPort
  const skillRegistry = runtime.skillRegistry
  await skillRegistry.refresh()
  await runtime.mcpReady
  const skillInvocation = runtime.skillInvocation
  const corsOrigins = options.corsOrigins ?? DEFAULT_CORS_ORIGINS
  const codingLoop = runtime.codingLoop
  const mcp = options.mcp ?? runtime.mcp
  const mcpOAuth = options.mcpOAuth ?? runtime.mcpOAuth
  assertPort(port)
  if (options.sessionStore) await options.sessionStore.list()
  if (runtimeInteractionStore) await runtimeInteractionStore.list()

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: options.idleTimeout ?? 0,
    fetch: async (request) => {
      if (request.method === "OPTIONS") return corsPreflight(request, corsOrigins)
      const traceId = traceIdFrom(request.headers.get(TRACE_ID_HEADER))
      const startedAt = Date.now()
      const path = new URL(request.url).pathname
      console.info("nexum.request_started", { traceId, method: request.method, path, startedAt })
      try {
        const response = await handleRequest(
          request,
          sessionService,
          eventHub,
          messageStore,
          runtimeInteractionStore,
          codingLoop,
          permissionBroker,
          questionPort,
          modelConfigStore,
          rolePromptStore,
          modelProbe,
          skillRegistry,
          skillInvocation,
          mcp,
          mcpOAuth,
          traceId,
        )
        const result = withCorsHeaders(response, request, corsOrigins)
        const endedAt = Date.now()
        console.info("nexum.request_completed", {
          traceId,
          method: request.method,
          path,
          status: result.status,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
        })
        return result
      } catch (error) {
        logRequestFailure(request, traceId, error)
        const result = withCorsHeaders(
          errorResponse(500, "NEXUM_INTERNAL_ERROR", "Nexum Service 暂时不可用", traceId),
          request,
          corsOrigins,
        )
        const endedAt = Date.now()
        console.info("nexum.request_completed", {
          traceId,
          method: request.method,
          path,
          status: result.status,
          startedAt,
          endedAt,
          durationMs: endedAt - startedAt,
        })
        return result
      }
    },
  })

  return {
    url: server.url,
    stop: async (closeActiveConnections = false) => {
      await server.stop(closeActiveConnections)
      if (ownsRuntime) await runtime.close()
    },
  }
}

function corsPreflight(request: Request, origins: readonly string[]): Response {
  const origin = request.headers.get("origin")
  if (!origin || !isAllowedOrigin(origin, origins)) {
    return errorResponse(
      403,
      "NEXUM_CORS_ORIGIN_NOT_ALLOWED",
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
    headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
    headers.set("access-control-allow-headers", "content-type, x-trace-id, last-event-id")
    headers.set("access-control-max-age", "300")
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function isAllowedOrigin(origin: string, origins: readonly string[]): boolean {
  return origins.some((allowedOrigin) => allowedOrigin.trim() === origin)
}

/**
 * 处理 Nexum Service 的健康检查与未知路径响应。
 *
 * @param request - 标准 Web 请求
 * @returns caller-safe HTTP 响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */
async function handleRequest(
  request: Request,
  sessionService: NexumSessionService,
  eventHub: NexumEventHub,
  messageStore: MessageStore,
  interactionStore: NexumInteractionStore | undefined,
  codingLoop?: NexumCodingLoop,
  permissionBroker?: NexumPermissionBroker,
  questionPort?: NexumQuestionPort,
  modelConfigStore?: NexumModelConfigStore,
  rolePromptStore?: NexumRolePromptStore,
  modelProbe?: NexumModelProbePort,
  skillRegistry?: NexumSkillRegistry,
  skillInvocation?: NexumSkillInvocationPort,
  mcp?: McpPort,
  mcpOAuth?: McpOAuthControlPort,
  requestTraceId?: string,
): Promise<Response> {
  const traceId = requestTraceId ?? traceIdFrom(request.headers.get(TRACE_ID_HEADER))
  const url = new URL(request.url)

  if (url.pathname === "/health/live" || url.pathname === "/health/ready") {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }

    const status = url.pathname === "/health/live" ? "ok" : "ready"
    return jsonResponse({ service: "nexum-server", status }, traceId, false)
  }

  if (url.pathname === "/api/nexum/capabilities") {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return jsonResponse(
      {
        data: {
          protocolVersion: NEXUM_PROTOCOL_VERSION,
          transport: { http: "json", events: "sse" },
          features: [...NEXUM_FEATURES],
          eventTypes: [...NEXUM_EVENT_TYPES],
          capabilities: capabilitiesFor(mcp),
        },
      },
      traceId,
    )
  }

  if (url.pathname === `${NEXUM_EXPERIMENTAL_API_PREFIX}/mcp`) {
    if (request.method === "GET") return listMcpServers(mcp, traceId)
    if (request.method === "POST") return registerMcpServer(request, mcp, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 或 POST 请求", traceId)
  }

  const mcpOAuthAuthorizeMatch = url.pathname.match(new RegExp(`^${NEXUM_EXPERIMENTAL_API_PREFIX}/mcp/([^/]+)/oauth/authorize$`))
  if (mcpOAuthAuthorizeMatch) {
    if (request.method !== "POST") return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    return startMcpOAuth(
      request,
      decodeURIComponent(mcpOAuthAuthorizeMatch[1]!),
      mcp,
      mcpOAuth,
      traceId,
    )
  }

  const mcpOAuthAttemptMatch = url.pathname.match(new RegExp(`^${NEXUM_EXPERIMENTAL_API_PREFIX}/mcp/oauth/([^/]+)(?:/(complete|cancel))?$`))
  if (mcpOAuthAttemptMatch) {
    const attemptID = decodeURIComponent(mcpOAuthAttemptMatch[1]!)
    const operation = mcpOAuthAttemptMatch[2]
    if (!operation && request.method === "GET") return getMcpOAuthStatus(attemptID, mcpOAuth, traceId)
    if (operation === "complete" && request.method === "POST") return completeMcpOAuth(request, attemptID, mcpOAuth, traceId)
    if (operation === "cancel" && request.method === "POST") return cancelMcpOAuth(attemptID, mcpOAuth, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "MCP OAuth 操作方法不匹配", traceId)
  }

  const mcpMatch = url.pathname.match(
    new RegExp(`^${NEXUM_EXPERIMENTAL_API_PREFIX}/mcp/([^/]+)(?:/(tools|resources|prompts|connect|disconnect))?$`),
  )
  if (mcpMatch) {
    const serverID = decodeURIComponent(mcpMatch[1]!)
    const operation = mcpMatch[2]
    if (!operation && request.method === "DELETE") return removeMcpServer(serverID, mcp, traceId)
    if (operation === "tools" && request.method === "GET") return listMcpTools(serverID, mcp, traceId)
    if (operation === "resources" && request.method === "GET") return listMcpResources(serverID, mcp, traceId)
    if (operation === "prompts" && request.method === "GET") return listMcpPrompts(serverID, mcp, traceId)
    if (operation === "connect" && request.method === "POST") return connectMcpServer(serverID, mcp, traceId)
    if (operation === "disconnect" && request.method === "POST") return disconnectMcpServer(serverID, mcp, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "MCP 操作方法不匹配", traceId)
  }

  if (url.pathname === "/api/nexum/session") {
    if (request.method === "GET") return listSessions(sessionService, traceId)
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createSession(request, sessionService, traceId)
  }

  const continueMatch = url.pathname.match(
    new RegExp(`^${NEXUM_EXPERIMENTAL_API_PREFIX}/session/([^/]+)/continue$`),
  )
  if (continueMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return continueSession(
      request,
      decodeURIComponent(continueMatch[1]!),
      sessionService,
      codingLoop,
      traceId,
    )
  }

  const messagesMatch = url.pathname.match(
    new RegExp(`^${NEXUM_EXPERIMENTAL_API_PREFIX}/session/([^/]+)/messages$`),
  )
  if (messagesMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listSessionMessages(
      url,
      decodeURIComponent(messagesMatch[1]!),
      sessionService,
      messageStore,
      traceId,
    )
  }

  const updateSessionMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)$/)
  if (updateSessionMatch) {
    const sessionID = decodeURIComponent(updateSessionMatch[1]!)
    if (request.method === "PUT") return updateSession(request, sessionID, sessionService, traceId)
    if (request.method === "DELETE") {
      return deleteSession(request, { sessionID, messageStore, interactionStore, eventHub, sessionService }, traceId)
    }
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 PUT 或 DELETE 请求", traceId)
  }

  if (url.pathname === "/api/nexum/model") {
    if (request.method === "GET") return getModelConfig(modelConfigStore, traceId)
    if (request.method === "PUT") return updateModelConfig(request, modelConfigStore, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 或 PUT 请求", traceId)
  }

  if (url.pathname === "/api/nexum/model/probe") {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return probeModel(request, modelProbe, traceId)
  }

  if (url.pathname === "/api/nexum/role-prompt") {
    if (request.method === "GET") return getRolePrompt(rolePromptStore, traceId)
    if (request.method === "PUT") return updateRolePrompt(request, rolePromptStore, traceId)
    if (request.method === "DELETE") return resetRolePrompt(rolePromptStore, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET、PUT 或 DELETE 请求", traceId)
  }

  if (url.pathname === "/api/nexum/skills") {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listSkills(skillRegistry, traceId)
  }

  if (url.pathname === "/api/nexum/skills/register") {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return registerSkill(request, skillRegistry, traceId)
  }

  if (url.pathname === "/api/nexum/skills/refresh") {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return refreshSkills(request, skillRegistry, traceId)
  }

  if (url.pathname === "/api/nexum/skills/validate") {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return validateSkills(request, skillRegistry, traceId)
  }

  const skillActivateMatch = url.pathname.match(/^\/api\/nexum\/skills\/([^/]+)\/activate$/)
  if (skillActivateMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return activateSkill(request, decodeURIComponent(skillActivateMatch[1]!), sessionService, skillInvocation, traceId)
  }

  const skillDetailMatch = url.pathname.match(/^\/api\/nexum\/skills\/([^/]+)$/)
  if (skillDetailMatch) {
    const skillID = decodeURIComponent(skillDetailMatch[1]!)
    if (request.method === "GET") return detailSkill(skillID, skillRegistry, traceId)
    if (request.method === "DELETE") return unregisterSkill(skillID, skillRegistry, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 或 DELETE 请求", traceId)
  }

  const promptMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/prompt$/)
  if (promptMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return createPrompt(request, decodeURIComponent(promptMatch[1]!), sessionService, codingLoop, traceId)
  }

  const stateMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/state$/)
  if (stateMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return getSessionState(
      decodeURIComponent(stateMatch[1]!),
      sessionService,
      codingLoop,
      permissionBroker,
      questionPort,
      eventHub,
      traceId,
    )
  }

  const cancelMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/cancel$/)
  if (cancelMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return cancelSession(decodeURIComponent(cancelMatch[1]!), sessionService, codingLoop, traceId)
  }

  const eventsMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/events$/)
  if (eventsMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    const afterSequence = parseMessagePageParameter(url.searchParams.get("afterSequence"), undefined)
    if (url.searchParams.has("afterSequence") && afterSequence === undefined) {
      return errorResponse(400, "NEXUM_INVALID_REQUEST", "afterSequence 必须是非负整数", traceId)
    }
    return streamEvents(
      decodeURIComponent(eventsMatch[1]!),
      sessionService,
      eventHub,
      request.headers.get("last-event-id") ?? url.searchParams.get("after"),
      afterSequence,
      traceId,
    )
  }

  if (url.pathname === "/api/nexum/permission/policy") {
    if (request.method === "GET") return listPermissionPolicy(url, sessionService, permissionBroker, traceId)
    if (request.method === "POST") return createPermissionPolicyRule(request, sessionService, permissionBroker, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 或 POST 请求", traceId)
  }

  const permissionPolicyRuleMatch = url.pathname.match(/^\/api\/nexum\/permission\/policy\/([^/]+)$/)
  if (permissionPolicyRuleMatch) {
    const ruleID = decodeURIComponent(permissionPolicyRuleMatch[1]!)
    if (request.method === "PUT") return updatePermissionPolicyRule(request, ruleID, permissionBroker, traceId)
    if (request.method === "DELETE") return deletePermissionPolicyRule(ruleID, permissionBroker, traceId)
    return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 PUT 或 DELETE 请求", traceId)
  }

  const permissionListMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/permission$/)
  if (permissionListMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listPermissions(decodeURIComponent(permissionListMatch[1]!), sessionService, permissionBroker, traceId)
  }

  const permissionReplyMatch = url.pathname.match(
    /^\/api\/nexum\/session\/([^/]+)\/permission\/([^/]+)\/reply$/,
  )
  if (permissionReplyMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
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

  const questionListMatch = url.pathname.match(/^\/api\/nexum\/session\/([^/]+)\/question$/)
  if (questionListMatch) {
    if (request.method !== "GET") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 GET 请求", traceId)
    }
    return listQuestions(decodeURIComponent(questionListMatch[1]!), sessionService, questionPort, traceId)
  }

  const questionReplyMatch = url.pathname.match(
    /^\/api\/nexum\/session\/([^/]+)\/question\/([^/]+)\/reply$/,
  )
  if (questionReplyMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
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
    /^\/api\/nexum\/session\/([^/]+)\/question\/([^/]+)\/cancel$/,
  )
  if (questionCancelMatch) {
    if (request.method !== "POST") {
      return errorResponse(405, "NEXUM_METHOD_NOT_ALLOWED", "只支持 POST 请求", traceId)
    }
    return cancelQuestion(
      decodeURIComponent(questionCancelMatch[1]!),
      decodeURIComponent(questionCancelMatch[2]!),
      sessionService,
      questionPort,
      traceId,
    )
  }

  return errorResponse(404, "NEXUM_ROUTE_NOT_FOUND", "请求路径不存在", traceId)
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
async function listSkills(skillRegistry: NexumSkillRegistry | undefined, traceId: string): Promise<Response> {
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
  skillRegistry: NexumSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const summary = (await skillRegistry.list()).find((item) => item.id === skillID)
  return summary
    ? jsonResponse({ data: summary }, traceId)
    : errorResponse(404, "NEXUM_SKILL_NOT_FOUND", "Skill 不存在", traceId)
}

/**
 * 按地址幂等注册一个本地 Skill。
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
  skillRegistry: NexumSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.address !== "string" || payload.address.trim() === "") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "address 必须是非空字符串", traceId)
  }
  try {
    const data = await skillRegistry.register(payload.address)
    return jsonResponse({ data }, traceId)
  } catch {
    return errorResponse(400, "NEXUM_SKILL_REGISTER_FAILED", "Skill 地址无法注册", traceId)
  }
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
async function refreshSkills(
  request: Request,
  skillRegistry: NexumSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => ({}))
  if (!isRecord(payload) || (payload.id !== undefined && typeof payload.id !== "string")) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "id 必须是字符串", traceId)
  }
  await skillRegistry.refresh(payload.id)
  return listSkills(skillRegistry, traceId)
}

/**
 * 取消注册一个 Skill，不操作源目录。
 * @param skillID - 路径中的 Skill ID
 * @param skillRegistry - Skill Registry
 * @param traceId - 当前请求链路标识
 * @returns 空成功响应或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function unregisterSkill(
  skillID: string,
  skillRegistry: NexumSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  try {
    await skillRegistry.unregister(skillID)
    return jsonResponse({ data: { id: skillID, deleted: true } }, traceId)
  } catch {
    return errorResponse(404, "NEXUM_SKILL_NOT_FOUND", "Skill 未注册", traceId)
  }
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
  skillRegistry: NexumSkillRegistry | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillRegistry) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => ({}))
  if (!isRecord(payload) || (payload.id !== undefined && typeof payload.id !== "string")) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "id 必须是字符串", traceId)
  }
  await skillRegistry.refresh(payload.id)
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
  sessionService: NexumSessionService,
  skillInvocation: NexumSkillInvocationPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!skillInvocation) return skillRegistryUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.sessionID !== "string" || typeof payload.text !== "string") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "sessionID 和 text 必须是字符串", traceId)
  }
  if (!(await sessionService.get(payload.sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
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
  if (!(error instanceof NexumSkillInvocationError)) {
    return errorResponse(500, "NEXUM_SKILL_ACTIVATION_FAILED", "Skill 激活失败", traceId)
  }
  if (error.code === "skill_not_found") {
    return errorResponse(404, "NEXUM_SKILL_NOT_FOUND", error.message, traceId)
  }
  if (error.code === "skill_not_ready") {
    return errorResponse(409, "NEXUM_SKILL_NOT_READY", error.message, traceId)
  }
  return errorResponse(409, "NEXUM_SKILL_PERMISSION_DENIED", error.message, traceId)
}

function capabilitiesFor(mcp: McpPort | undefined) {
  if (!mcp) return [...NEXUM_CAPABILITIES]
  return NEXUM_CAPABILITIES.map((capability) =>
    capability.id === "mcp" ? { ...capability, status: "enabled" as const } : capability,
  )
}

async function listMcpServers(mcp: McpPort | undefined, traceId: string): Promise<Response> {
  if (!mcp) return mcpUnavailable(traceId)
  return jsonResponse({ data: await mcp.listServers() }, traceId)
}

async function registerMcpServer(request: Request, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  const registry = requireMcpRegistry(mcp)
  if (!registry) return mcpControlUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload)) return errorResponse(400, "NEXUM_INVALID_REQUEST", "请求体必须是 JSON 对象", traceId)
  const config = parseMcpServerConfig(payload)
  if (!config) return errorResponse(400, "NEXUM_MCP_INVALID_CONFIG", "MCP Server 配置无效", traceId)
  try {
    return jsonResponse({ data: await registry.register(config) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function connectMcpServer(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  const registry = requireMcpRegistry(mcp)
  if (!registry) return mcpControlUnavailable(traceId)
  try {
    return jsonResponse({ data: await registry.connect(serverID) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function disconnectMcpServer(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  const registry = requireMcpRegistry(mcp)
  if (!registry) return mcpControlUnavailable(traceId)
  try {
    const server = await registry.disconnect(serverID)
    return server
      ? jsonResponse({ data: server }, traceId)
      : errorResponse(404, "NEXUM_MCP_SERVER_NOT_FOUND", "MCP Server 不存在", traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function removeMcpServer(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  const registry = requireMcpRegistry(mcp)
  if (!registry) return mcpControlUnavailable(traceId)
  try {
    await registry.remove(serverID)
    return jsonResponse({ data: { id: serverID, deleted: true } }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function listMcpTools(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  if (!mcp) return mcpUnavailable(traceId)
  try {
    return jsonResponse({ data: await mcp.listTools(serverID) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function listMcpResources(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  if (!mcp) return mcpUnavailable(traceId)
  try {
    return jsonResponse({ data: await mcp.listResources(serverID) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function listMcpPrompts(serverID: string, mcp: McpPort | undefined, traceId: string): Promise<Response> {
  if (!mcp) return mcpUnavailable(traceId)
  try {
    return jsonResponse({ data: await mcp.listPrompts(serverID) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function startMcpOAuth(
  request: Request,
  serverID: string,
  mcp: McpPort | undefined,
  oauth: McpOAuthControlPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!oauth) return mcpOAuthUnavailable(traceId)
  const payload = await request.json().catch(() => ({}))
  if (!isRecord(payload) || (payload.url !== undefined && typeof payload.url !== "string")) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "url 必须是字符串", traceId)
  }
  const registry = requireMcpRegistry(mcp)
  const server = await registry?.get(serverID)
  const serverUrl = server?.url ?? payload.url
  if (typeof serverUrl !== "string" || serverUrl.trim() === "") {
    return errorResponse(400, "NEXUM_MCP_INVALID_CONFIG", "MCP Server URL 不存在", traceId)
  }
  try {
    return jsonResponse({ data: await oauth.start({ serverID, serverUrl }) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function getMcpOAuthStatus(
  attemptID: string,
  oauth: McpOAuthControlPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!oauth) return mcpOAuthUnavailable(traceId)
  const attempt = await oauth.status(attemptID)
  return attempt
    ? jsonResponse({ data: attempt }, traceId)
    : errorResponse(404, "NEXUM_MCP_OAUTH_ATTEMPT_NOT_FOUND", "MCP OAuth 授权尝试不存在", traceId)
}

async function completeMcpOAuth(
  request: Request,
  attemptID: string,
  oauth: McpOAuthControlPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!oauth) return mcpOAuthUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.redirectUrl !== "string" || payload.redirectUrl.trim() === "") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "redirectUrl 必须是非空字符串", traceId)
  }
  try {
    return jsonResponse({ data: await oauth.complete(attemptID, payload.redirectUrl) }, traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

async function cancelMcpOAuth(
  attemptID: string,
  oauth: McpOAuthControlPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!oauth) return mcpOAuthUnavailable(traceId)
  try {
    const attempt = await oauth.cancel(attemptID)
    return attempt
      ? jsonResponse({ data: attempt }, traceId)
      : errorResponse(404, "NEXUM_MCP_OAUTH_ATTEMPT_NOT_FOUND", "MCP OAuth 授权尝试不存在", traceId)
  } catch (error) {
    return mcpErrorResponse(error, traceId)
  }
}

function requireMcpRegistry(mcp: McpPort | undefined): McpRegistry | undefined {
  if (
    !mcp ||
    typeof (mcp as Partial<McpRegistry>).register !== "function" ||
    typeof (mcp as Partial<McpRegistry>).connect !== "function" ||
    typeof (mcp as Partial<McpRegistry>).disconnect !== "function" ||
    typeof (mcp as Partial<McpRegistry>).remove !== "function"
  ) {
    return undefined
  }
  return mcp as McpRegistry
}

function parseMcpServerConfig(payload: Record<string, unknown>): McpServerConfig | undefined {
  if (
    typeof payload.id !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.url !== "string" ||
    (payload.disabled !== undefined && typeof payload.disabled !== "boolean") ||
    (payload.timeoutMs !== undefined && (typeof payload.timeoutMs !== "number" || !Number.isFinite(payload.timeoutMs))) ||
    (payload.protocol !== undefined && payload.protocol !== "legacy" && payload.protocol !== "auto" && payload.protocol !== "2026-07-28")
  ) {
    return undefined
  }
  if (payload.headers !== undefined && !isRecord(payload.headers)) return undefined
  if (payload.headers && Object.values(payload.headers).some((value) => typeof value !== "string")) return undefined
  return {
    id: payload.id,
    name: payload.name,
    url: payload.url,
    ...(payload.headers ? { headers: Object.fromEntries(Object.entries(payload.headers).map(([key, value]) => [key, value as string])) } : {}),
    ...(payload.disabled !== undefined ? { disabled: payload.disabled } : {}),
    ...(payload.timeoutMs !== undefined ? { timeoutMs: payload.timeoutMs } : {}),
    ...(payload.protocol !== undefined ? { protocol: payload.protocol } : {}),
  }
}

function mcpUnavailable(traceId: string): Response {
  return errorResponse(503, "NEXUM_MCP_NOT_CONFIGURED", "Nexum MCP 尚未配置", traceId)
}

function mcpControlUnavailable(traceId: string): Response {
  return errorResponse(503, "NEXUM_MCP_CONTROL_NOT_CONFIGURED", "Nexum MCP 控制接口尚未配置", traceId)
}

function mcpOAuthUnavailable(traceId: string): Response {
  return errorResponse(503, "NEXUM_MCP_OAUTH_NOT_CONFIGURED", "Nexum MCP OAuth 尚未配置", traceId)
}

function mcpErrorResponse(error: unknown, traceId: string): Response {
  if (!(error instanceof McpError)) return errorResponse(500, "NEXUM_MCP_OPERATION_FAILED", "MCP 操作失败", traceId)
  const statuses = {
    invalid_config: 400,
    server_exists: 409,
    server_not_found: 404,
    server_not_connected: 409,
    runtime_closed: 409,
    connection_failed: 502,
    needs_auth: 401,
  } as const
  const codes = {
    invalid_config: "NEXUM_MCP_INVALID_CONFIG",
    server_exists: "NEXUM_MCP_SERVER_EXISTS",
    server_not_found: "NEXUM_MCP_SERVER_NOT_FOUND",
    server_not_connected: "NEXUM_MCP_SERVER_NOT_CONNECTED",
    runtime_closed: "NEXUM_RUNTIME_CLOSED",
    connection_failed: "NEXUM_MCP_CONNECTION_FAILED",
    needs_auth: "NEXUM_MCP_NEEDS_AUTH",
  } as const
  return errorResponse(statuses[error.code], codes[error.code], error.message, traceId)
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
  return errorResponse(503, "NEXUM_SKILL_REGISTRY_NOT_CONFIGURED", "Nexum Skill Registry 尚未配置", traceId)
}

/** 返回所有可供页面恢复的 Nexum Session。 */
async function listSessions(sessionService: NexumSessionService, traceId: string): Promise<Response> {
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

/** 返回 Session 的安全 canonical 消息分页。 */
async function listSessionMessages(
  url: URL,
  sessionID: string,
  sessionService: NexumSessionService,
  messageStore: MessageStore,
  traceId: string,
): Promise<Response> {
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  const limit = parseMessagePageParameter(url.searchParams.get("limit"), 50)
  const before = parseMessagePageParameter(url.searchParams.get("before"), undefined)
  const snapshot = url.searchParams.get("snapshot")
  if (limit === undefined || limit < 1 || limit > 100) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "limit 必须是 1 到 100 的整数", traceId)
  }
  if (url.searchParams.has("before") && before === undefined) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "before 必须是非负整数", traceId)
  }

  const history = await messageStore.load(sessionID)
  const snapshotID = messageSnapshot(history)
  if (before !== undefined && snapshot !== null && snapshot !== snapshotID) {
    return errorResponse(409, "NEXUM_HISTORY_SNAPSHOT_EXPIRED", "历史消息快照已过期，请重新加载", traceId)
  }
  const end = before ?? history.length
  if (end > history.length) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "before 超出消息历史范围", traceId)
  }
  const start = Math.max(0, end - limit)
  const data: NexumSessionMessages = {
    messages: history.slice(start, end).map((message, offset) => ({
      index: start + offset,
      message: publicMessage(message),
    })),
    total: history.length,
    hasMore: start > 0,
    snapshotID,
    ...(start > 0 ? { nextBefore: start } : {}),
  }
  return jsonResponse({ data }, traceId)
}

/** 解析消息分页参数，未提供参数时使用调用方给定的默认值。 */
function parseMessagePageParameter(value: string | null, fallback: number | undefined): number | undefined {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

/** 为分页历史生成当前 canonical 消息快照标识。 */
function messageSnapshot(history: readonly ModelMessage[]): string {
  return createHash("sha256").update(JSON.stringify(history)).digest("hex")
}

/** 将 Core canonical 消息转换成可供页面读取的脱敏消息。 */
function publicMessage(message: ModelMessage): NexumMessage {
  if (message.role === "system") {
    if (message.sourceID !== "context:summary") {
      return {
        role: "system",
        sourceID: "context:hidden",
        content: "内部系统上下文未在对话历史中展示",
      }
    }
    return {
      role: "system",
      content: redactNexumSensitiveValue(message.content) as string,
      ...(message.sourceID ? { sourceID: message.sourceID } : {}),
    }
  }
  if (message.role === "user") {
    return { role: "user", content: redactNexumSensitiveValue(message.content) as string }
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      toolCallID: message.toolCallID,
      content: redactNexumSensitiveValue(message.content) as string,
    }
  }
  return {
    role: "assistant",
    ...(message.content !== undefined
      ? { content: redactNexumSensitiveValue(message.content) as string }
      : {}),
    ...(message.reasoningContent !== undefined
      ? { reasoningContent: redactNexumSensitiveValue(message.reasoningContent) as string }
      : {}),
    ...(message.toolCalls
      ? {
          toolCalls: message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.name,
            input: redactPublicRecord(toolCall.input),
          })),
        }
      : {}),
  }
}

/** 对消息中的结构化值按字段名和文本规则做展示层脱敏。 */
function redactPublicRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveMessageKey(key) ? "[REDACTED]" : redactPublicValue(item),
    ]),
  )
}

/** 递归处理消息中的数组、对象和凭据形状文本。 */
function redactPublicValue(value: unknown): unknown {
  if (typeof value === "string") return redactNexumSensitiveValue(value)
  if (Array.isArray(value)) return value.map(redactPublicValue)
  if (isRecord(value)) return redactPublicRecord(value)
  return value
}

/** 判断结构化消息字段是否可能直接承载凭据。 */
function isSensitiveMessageKey(key: string): boolean {
  return /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|client[_-]?secret|private[_-]?key|token|password|secret|credential)/i.test(
    key,
  )
}

/** 执行安全模型能力 Probe，只返回能力状态。 */
async function probeModel(
  request: Request,
  modelProbe: NexumModelProbePort | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelProbe) return errorResponse(503, "NEXUM_MODEL_PROBE_NOT_CONFIGURED", "模型 Probe 尚未配置", traceId)
  const payload = await request.json().catch(() => undefined)
  const mode = isRecord(payload) && payload.mode !== undefined ? payload.mode : "both"
  if (mode !== "text" && mode !== "function_calling" && mode !== "both") {
    return errorResponse(400, "NEXUM_INVALID_MODEL_PROBE", "模型 Probe 模式无效", traceId)
  }

  try {
    const data = await modelProbe.probe({ mode: mode as NexumModelProbeMode })
    return jsonResponse({ data }, traceId)
  } catch (error) {
    if (error instanceof NexumModelError && error.code === "authentication_failed") {
      return errorResponse(401, "NEXUM_MODEL_AUTH_FAILED", "模型认证失败", traceId)
    }
    if (error instanceof NexumModelProbeError || error instanceof NexumModelError) {
      return errorResponse(503, "NEXUM_MODEL_PROBE_FAILED", error.message, traceId)
    }
    return errorResponse(503, "NEXUM_MODEL_PROBE_FAILED", "模型 Probe 失败", traceId)
  }
}

/**
 * 接受 Prompt 并异步启动 Nexum Coding Loop。
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
  sessionService: NexumSessionService,
  codingLoop: NexumCodingLoop | undefined,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  if (session.status === "running") {
    return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再提交", traceId)
  }
  if (!codingLoop) {
    return errorResponse(503, "NEXUM_RUNTIME_NOT_CONFIGURED", "Nexum Runtime 尚未配置", traceId)
  }

  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.text !== "string" || payload.text.trim() === "") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "text 必须是非空字符串", traceId)
  }

  const started = codingLoop.start?.({ sessionID, text: payload.text })
  if (started) {
    if (!started.accepted) {
      return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再提交", traceId)
    }
    if (!started.admission) {
      return errorResponse(500, "NEXUM_INTERNAL_ERROR", "Nexum Service 暂时不可用", traceId)
    }
    try {
      await started.admission
    } catch (error) {
      void started.promise.catch(() => undefined)
      if (!(error instanceof NexumSessionError)) logRequestFailure(request, traceId, error)
      return promptAdmissionError(error, traceId)
    }
    void started.promise.catch(() => undefined)
    return jsonResponse({ data: { status: "accepted" } }, traceId)
  }

  try {
    await sessionService.setStatus(sessionID, "running")
  } catch (error) {
    if (!(error instanceof NexumSessionError)) logRequestFailure(request, traceId, error)
    return promptAdmissionError(error, traceId)
  }
  void codingLoop.run({ sessionID, text: payload.text }).catch(() => {
    void sessionService.setStatus(sessionID, "failed").catch(() => undefined)
  })
  return jsonResponse({ data: { status: "accepted" } }, traceId)
}

/**
 * 将 Prompt admission 异常转换为稳定的公共 HTTP 响应。
 *
 * @param error - admission 阶段捕获的异常
 * @param traceId - 当前请求链路标识
 * @returns caller-safe HTTP 错误响应
 * @author lvdaxianer@yeah.net
 */
function promptAdmissionError(error: unknown, traceId: string): Response {
  if (error instanceof NexumSessionError && error.code === "session_not_found") {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  if (error instanceof NexumSessionError && error.code === "session_busy") {
    return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再提交", traceId)
  }
  return errorResponse(500, "NEXUM_INTERNAL_ERROR", "Nexum Service 暂时不可用", traceId)
}

/**
 * 接受从既有 User 或 Tool 上下文继续运行的实验性请求。
 *
 * @param request - 标准 Web 请求
 * @param sessionID - 目标 Session ID
 * @param sessionService - Session 查询服务
 * @param codingLoop - 可选的 Coding Loop 继续适配器
 * @param traceId - 当前请求链路标识
 * @returns accepted 响应或 caller-safe 错误响应
 */
async function continueSession(
  request: Request,
  sessionID: string,
  sessionService: NexumSessionService,
  codingLoop: NexumCodingLoop | undefined,
  traceId: string,
): Promise<Response> {
  const admissionError = continueAdmissionError(await sessionService.get(sessionID), codingLoop, traceId)
  if (admissionError) return admissionError

  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload)) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "请求体必须是 JSON 对象", traceId)
  }
  if (!codingLoop!.continueStart && codingLoop!.canContinue && !(await codingLoop!.canContinue(sessionID))) {
    return errorResponse(409, "NEXUM_SESSION_NOT_CONTINUABLE", "Session 没有可继续的上下文", traceId)
  }

  return startContinue(request, codingLoop!, sessionID, traceId)
}

/**
 * 校验 Continue 请求的 Session 与 Runtime 前置条件。
 *
 * @param session - 当前 Session 快照
 * @param codingLoop - 可选的 Coding Loop 继续适配器
 * @param traceId - 当前请求链路标识
 * @returns 前置条件错误或 undefined
 * @author lvdaxianer@yeah.net
 */
function continueAdmissionError(
  session: SessionRecord | undefined,
  codingLoop: NexumCodingLoop | undefined,
  traceId: string,
): Response | undefined {
  if (!session) return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  if (session.status === "running") {
    return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再继续", traceId)
  }
  if (!codingLoop?.continueStart) {
    return errorResponse(503, "NEXUM_CONTINUE_NOT_CONFIGURED", "Nexum Continue 尚未配置", traceId)
  }
  return undefined
}

/**
 * 启动 Continue 并返回异步受理结果。
 *
 * @param codingLoop - Coding Loop 继续适配器
 * @param sessionID - 目标 Session ID
 * @param traceId - 当前请求链路标识
 * @returns accepted 响应或同步启动错误响应
 * @author lvdaxianer@yeah.net
 */
async function startContinue(request: Request, codingLoop: NexumCodingLoop, sessionID: string, traceId: string): Promise<Response> {
  try {
    const started = await codingLoop.continueStart!(sessionID)
    if (!started.accepted) return continueAdmissionResponse(started.reason, traceId)
    if (!started.admission) return errorResponse(503, "NEXUM_CONTINUE_FAILED", "Nexum Continue 暂时不可用", traceId)
    try {
      await started.admission
    } catch (error) {
      void started.promise.catch(() => undefined)
      if (!(error instanceof NexumSessionError) && !(error instanceof NexumRunError)) logRequestFailure(request, traceId, error)
      return continueErrorResponse(error, traceId)
    }
    void started.promise.catch(() => undefined)
    return jsonResponse({ data: { status: "accepted" } }, traceId)
  } catch (error) {
    if (!(error instanceof NexumSessionError) && !(error instanceof NexumRunError)) logRequestFailure(request, traceId, error)
    return continueErrorResponse(error, traceId)
  }
}

/**
 * 将 Core Continue admission 结果转换为稳定 HTTP 响应。
 *
 * @param reason - Core 返回的受理失败原因
 * @param traceId - 当前请求链路标识
 * @returns caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 */
function continueAdmissionResponse(reason: "session_busy" | "not_continuable", traceId: string): Response {
  if (reason === "not_continuable") {
    return errorResponse(409, "NEXUM_SESSION_NOT_CONTINUABLE", "Session 没有可继续的上下文", traceId)
  }
  return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再继续", traceId)
}

/**
 * 将 Continue 同步启动异常转换为稳定 HTTP 错误。
 *
 * @param error - Continue 启动异常
 * @param traceId - 当前请求链路标识
 * @returns caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 */
function continueErrorResponse(error: unknown, traceId: string): Response {
  if (error instanceof NexumSessionError && error.code === "session_not_found") {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  if (error instanceof NexumSessionError && error.code === "session_busy") {
    return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请等待本轮完成后再继续", traceId)
  }
  if (error instanceof NexumRunError && error.code === "not_continuable") {
    return errorResponse(409, "NEXUM_SESSION_NOT_CONTINUABLE", "Session 没有可继续的上下文", traceId)
  }
  return errorResponse(503, "NEXUM_CONTINUE_FAILED", "Nexum Continue 暂时不可用", traceId)
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
  sessionService: NexumSessionService,
  codingLoop: NexumCodingLoop | undefined,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  try {
    if (codingLoop) {
      await codingLoop.cancel(sessionID)
    } else if (session.status === "idle" || session.status === "running") {
      await sessionService.setStatus(sessionID, "cancelled")
    }
    return jsonResponse({ data: { status: "cancelled" } }, traceId)
  } catch (error) {
    if (error instanceof NexumSessionError && error.code === "session_not_found") {
      return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", error.message, traceId)
    }
    return errorResponse(409, "NEXUM_SESSION_CANCEL_CONFLICT", "Session 当前状态不允许取消", traceId)
  }
}

/** 将指定 Session 的运行事件转换为 SSE 响应。 */
async function streamEvents(
  sessionID: string,
  sessionService: NexumSessionService,
  eventHub: NexumEventHub,
  afterEventID: string | null,
  afterSequence: number | undefined,
  traceId: string,
): Promise<Response> {
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }

  const encoder = new TextEncoder()
  const iterator = eventHub.subscribe(
    sessionID,
    afterEventID || afterSequence !== undefined
      ? {
          ...(afterEventID ? { afterEventID } : {}),
          ...(afterSequence !== undefined ? { afterSequence } : {}),
        }
      : undefined,
  )[Symbol.asyncIterator]()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": nexum-events-connected\n\n"))
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
  sessionService: NexumSessionService,
  codingLoop: NexumCodingLoop | undefined,
  permissionBroker: NexumPermissionBroker | undefined,
  questionPort: NexumQuestionPort | undefined,
  eventHub: NexumEventHub,
  traceId: string,
): Promise<Response> {
  const session = await sessionService.get(sessionID)
  if (!session) return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
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
        canContinue: codingLoop?.canContinue ? await codingLoop.canContinue(sessionID) : false,
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
  sessionService: NexumSessionService,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) {
    return errorResponse(503, "NEXUM_PERMISSION_NOT_CONFIGURED", "Nexum Permission 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
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
  sessionService: NexumSessionService,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) {
    return errorResponse(503, "NEXUM_PERMISSION_NOT_CONFIGURED", "Nexum Permission 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.decision !== "string") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "decision 必须是有效的权限决策", traceId)
  }

  try {
    const decision = await permissionBroker.reply({
      sessionID,
      requestID,
      decision: payload.decision as "allow_once" | "allow_always" | "deny",
    })
    return jsonResponse({ data: { status: decision === "deny" ? "denied" : "approved" } }, traceId)
  } catch (error) {
    if (error instanceof NexumPermissionError && error.code === "not_found") {
      return errorResponse(404, "NEXUM_PERMISSION_NOT_FOUND", error.message, traceId)
    }
    if (error instanceof NexumPermissionError && error.code === "session_mismatch") {
      return errorResponse(409, "NEXUM_PERMISSION_SESSION_MISMATCH", error.message, traceId)
    }
    if (error instanceof NexumPermissionError && error.code === "invalid_decision") {
      return errorResponse(400, "NEXUM_INVALID_REQUEST", error.message, traceId)
    }
    return errorResponse(500, "NEXUM_PERMISSION_REPLY_FAILED", "权限审批失败", traceId)
  }
}

/**
 * 策略接口允许的 action 白名单。
 *
 * `*` 表示 action-agnostic 规则，只按 resource 匹配所有工具调用；其余只接受具体工具名，
 * 不接受 `s*` 这类部分通配，避免一条规则顺带放行意料之外的工具。
 */
const PERMISSION_POLICY_ACTIONS = [nexumAnyToolAction, "shell", "read", "write", "edit"] as const

/**
 * 返回全局默认策略和指定 Session 的覆盖策略。
 *
 * @param url - 携带可选 sessionID 查询参数的请求地址
 * @param sessionService - Session 查询服务
 * @param permissionBroker - 权限审批 Broker
 * @param traceId - 当前请求链路标识
 * @returns 策略规则列表或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function listPermissionPolicy(
  url: URL,
  sessionService: NexumSessionService,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) return permissionUnavailable(traceId)
  const sessionID = url.searchParams.get("sessionID")?.trim() || undefined
  if (sessionID && !(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  try {
    const rules = await permissionBroker.policy.list(sessionID ? { sessionID } : undefined)
    return jsonResponse({ data: { rules, defaultEffect: "ask", ...(sessionID ? { sessionID } : {}) } }, traceId)
  } catch (error) {
    return permissionPolicyErrorResponse(error, traceId)
  }
}

/**
 * 新建一条全局或 Session 覆盖权限策略。
 *
 * @param request - 包含 action、resource、effect 和可选 scope 的 JSON 请求
 * @param sessionService - Session 查询服务
 * @param permissionBroker - 权限审批 Broker
 * @param traceId - 当前请求链路标识
 * @returns 新建的策略规则或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function createPermissionPolicyRule(
  request: Request,
  sessionService: NexumSessionService,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) return permissionUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    typeof payload.action !== "string" ||
    typeof payload.resource !== "string" ||
    typeof payload.effect !== "string"
  ) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "action、resource 和 effect 必须是字符串", traceId)
  }
  if (!isPermissionPolicyAction(payload.action)) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", PERMISSION_POLICY_ACTION_HINT, traceId)
  }
  const scope = payload.scope ?? "global"
  if (scope !== "global" && scope !== "session") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "scope 只支持 global 或 session", traceId)
  }
  const sessionID = scope === "session" && typeof payload.sessionID === "string" ? payload.sessionID.trim() : ""
  if (scope === "session") {
    if (!sessionID) {
      return errorResponse(400, "NEXUM_INVALID_REQUEST", "Session 作用域的策略必须提供 sessionID", traceId)
    }
    if (!(await sessionService.get(sessionID))) {
      return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
    }
  }

  try {
    const rule = await permissionBroker.policy.add({
      action: payload.action,
      resource: payload.resource,
      effect: payload.effect,
      scope,
      ...(scope === "session" ? { sessionID } : {}),
    })
    return jsonResponse({ data: rule }, traceId)
  } catch (error) {
    return permissionPolicyErrorResponse(error, traceId)
  }
}

/**
 * 修改已有策略的 action、resource 或 effect。
 *
 * @param request - 包含待修改字段的 JSON 请求
 * @param ruleID - 路径中的策略 ID
 * @param permissionBroker - 权限审批 Broker
 * @param traceId - 当前请求链路标识
 * @returns 修改后的策略规则或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function updatePermissionPolicyRule(
  request: Request,
  ruleID: string,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) return permissionUnavailable(traceId)
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload)) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "请求体必须是 JSON 对象", traceId)
  }
  const action = payload.action
  const resource = payload.resource
  const effect = payload.effect
  if (action === undefined && resource === undefined && effect === undefined) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "至少需要提供 action、resource 或 effect", traceId)
  }
  if (action !== undefined && (typeof action !== "string" || !isPermissionPolicyAction(action))) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", PERMISSION_POLICY_ACTION_HINT, traceId)
  }
  if (resource !== undefined && typeof resource !== "string") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "resource 必须是字符串", traceId)
  }
  if (effect !== undefined && typeof effect !== "string") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "effect 必须是字符串", traceId)
  }

  try {
    const rule = await permissionBroker.policy.update(ruleID, {
      ...(typeof action === "string" ? { action } : {}),
      ...(typeof resource === "string" ? { resource } : {}),
      ...(typeof effect === "string" ? { effect } : {}),
    })
    return jsonResponse({ data: rule }, traceId)
  } catch (error) {
    return permissionPolicyErrorResponse(error, traceId)
  }
}

/**
 * 删除一条策略，删除后对应请求回落到下一层判定。
 *
 * @param ruleID - 路径中的策略 ID
 * @param permissionBroker - 权限审批 Broker
 * @param traceId - 当前请求链路标识
 * @returns 删除结果或稳定错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
async function deletePermissionPolicyRule(
  ruleID: string,
  permissionBroker: NexumPermissionBroker | undefined,
  traceId: string,
): Promise<Response> {
  if (!permissionBroker) return permissionUnavailable(traceId)
  try {
    const rule = await permissionBroker.policy.remove(ruleID)
    return jsonResponse({ data: { id: rule.id, deleted: true } }, traceId)
  } catch (error) {
    return permissionPolicyErrorResponse(error, traceId)
  }
}

/** 策略 action 校验失败时返回的稳定文案。 */
const PERMISSION_POLICY_ACTION_HINT = "action 只支持 shell、read、write、edit 或 *（匹配所有工具）"

/** 判断 action 是否是具体工具动作，或表示匹配所有工具的 `*`。 */
function isPermissionPolicyAction(value: string): boolean {
  return PERMISSION_POLICY_ACTIONS.some((action) => action === value)
}

/** 统一返回权限能力未配置的服务错误。 */
function permissionUnavailable(traceId: string): Response {
  return errorResponse(503, "NEXUM_PERMISSION_NOT_CONFIGURED", "Nexum Permission 尚未配置", traceId)
}

/**
 * 把策略存储错误映射为稳定 HTTP 错误码。
 *
 * @param error - 策略存储抛出的错误
 * @param traceId - 当前请求链路标识
 * @returns caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-22
 */
function permissionPolicyErrorResponse(error: unknown, traceId: string): Response {
  if (error instanceof NexumPermissionPolicyError) {
    if (error.code === "not_found") {
      return errorResponse(404, "NEXUM_PERMISSION_POLICY_NOT_FOUND", error.message, traceId)
    }
    if (error.code === "duplicate_rule") {
      return errorResponse(409, "NEXUM_PERMISSION_POLICY_CONFLICT", error.message, traceId)
    }
    if (error.code === "invalid_file") {
      return errorResponse(500, "NEXUM_PERMISSION_POLICY_UNAVAILABLE", error.message, traceId)
    }
    return errorResponse(400, "NEXUM_INVALID_REQUEST", error.message, traceId)
  }
  return errorResponse(500, "NEXUM_PERMISSION_POLICY_FAILED", "权限策略操作失败", traceId)
}

/** 返回指定 Session 的待回答 Question。 */
async function listQuestions(
  sessionID: string,
  sessionService: NexumSessionService,
  questionPort: NexumQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "NEXUM_QUESTION_NOT_CONFIGURED", "Nexum Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  return jsonResponse({ data: await questionPort.list(sessionID) }, traceId)
}

/** 接收 Question 的结构化回答并唤醒阻塞的 Coding Loop。 */
async function replyQuestion(
  request: Request,
  sessionID: string,
  requestID: string,
  sessionService: NexumSessionService,
  questionPort: NexumQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "NEXUM_QUESTION_NOT_CONFIGURED", "Nexum Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.answers) ||
    !payload.answers.every((answers) => Array.isArray(answers) && answers.every((answer) => typeof answer === "string"))
  ) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "answers 必须是二维字符串数组", traceId)
  }

  try {
    const result = await questionPort.reply(sessionID, requestID, payload.answers as string[][])
    if (!result.ok) return errorResponse(409, "NEXUM_QUESTION_CANCELLED", result.output, traceId)
    return jsonResponse({ data: { status: "answered" } }, traceId)
  } catch (error) {
    return questionErrorResponse(error, traceId)
  }
}

/** 取消 pending Question，不生成伪造答案。 */
async function cancelQuestion(
  sessionID: string,
  requestID: string,
  sessionService: NexumSessionService,
  questionPort: NexumQuestionPort | undefined,
  traceId: string,
): Promise<Response> {
  if (!questionPort) {
    return errorResponse(503, "NEXUM_QUESTION_NOT_CONFIGURED", "Nexum Question 尚未配置", traceId)
  }
  if (!(await sessionService.get(sessionID))) {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  try {
    await questionPort.cancel(sessionID, requestID)
    return jsonResponse({ data: { status: "cancelled" } }, traceId)
  } catch (error) {
    return questionErrorResponse(error, traceId)
  }
}

function questionErrorResponse(error: unknown, traceId: string): Response {
  if (error instanceof NexumQuestionError && error.code === "not_found") {
    return errorResponse(404, "NEXUM_QUESTION_NOT_FOUND", error.message, traceId)
  }
  if (error instanceof NexumQuestionError && error.code === "session_mismatch") {
    return errorResponse(409, "NEXUM_QUESTION_SESSION_MISMATCH", error.message, traceId)
  }
  if (error instanceof NexumQuestionError && error.code === "invalid_answers") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", error.message, traceId)
  }
  return errorResponse(500, "NEXUM_QUESTION_FAILED", "Question 操作失败", traceId)
}

/**
 * 处理 Nexum Session 创建请求。
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
  sessionService: NexumSessionService,
  traceId: string,
): Promise<Response> {
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    typeof payload.directory !== "string" ||
    payload.directory.trim() === "" ||
    (payload.name !== undefined && typeof payload.name !== "string")
  ) {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "directory 必须是非空字符串", traceId)
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
    if (error instanceof NexumSessionError && error.code === "invalid_directory") {
      return errorResponse(400, "NEXUM_INVALID_DIRECTORY", error.message, traceId)
    }
    return errorResponse(500, "NEXUM_SESSION_CREATE_FAILED", "Session 创建失败", traceId)
  }
}

/**
 * 更新 Nexum Session 的展示名称。
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
  sessionService: NexumSessionService,
  traceId: string,
): Promise<Response> {
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.name !== "string") {
    return errorResponse(400, "NEXUM_INVALID_REQUEST", "name 必须是字符串", traceId)
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
    if (error instanceof NexumSessionError && error.code === "session_not_found") {
      return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", error.message, traceId)
    }
    if (error instanceof NexumSessionError && error.code === "invalid_name") {
      return errorResponse(400, "NEXUM_INVALID_REQUEST", error.message, traceId)
    }
    return errorResponse(500, "NEXUM_SESSION_UPDATE_FAILED", "Session 更新失败", traceId)
  }
}

/** Session 删除处理所需的运行时依赖。 */
type NexumSessionDeleteInput = {
  readonly sessionID: string
  readonly messageStore: MessageStore
  readonly interactionStore?: NexumInteractionStore
  readonly eventHub: NexumEventHub
  readonly sessionService: NexumSessionService
}

/**
 * 按固定顺序删除 Session 的历史、交互、事件和目录索引记录。
 *
 * @param input - Session 标识与删除依赖
 * @param traceId - 当前请求链路标识
 * @returns 删除结果或 caller-safe 错误响应
 * @author lvdaxianer@yeah.net
 * @date 2026-11-23
 */
async function deleteSession(request: Request, input: NexumSessionDeleteInput, traceId: string): Promise<Response> {
  try {
    await input.sessionService.delete(input.sessionID, async () => {
      await input.messageStore.delete(input.sessionID)
      await input.interactionStore?.deleteSession(input.sessionID)
      await input.eventHub.delete(input.sessionID)
    })
    return jsonResponse({ data: { id: input.sessionID, deleted: true } }, traceId)
  } catch (error) {
    if (!(error instanceof NexumSessionError)) logRequestFailure(request, traceId, error)
    return deleteSessionError(error, traceId)
  }
}

/** 将 Session 删除异常转换为稳定的公共错误响应。 */
function deleteSessionError(error: unknown, traceId: string): Response {
  if (error instanceof NexumSessionError && error.code === "session_not_found") {
    return errorResponse(404, "NEXUM_SESSION_NOT_FOUND", "Session 不存在", traceId)
  }
  if (error instanceof NexumSessionError && error.code === "session_busy") {
    return errorResponse(409, "NEXUM_SESSION_RUN_CONFLICT", "Session 当前正在运行，请先等待本轮完成后再删除", traceId)
  }
  return errorResponse(500, "NEXUM_SESSION_DELETE_FAILED", "Session 删除失败", traceId)
}

/** 返回当前模型配置的安全视图。 */
async function getModelConfig(
  modelConfigStore: NexumModelConfigStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelConfigStore) {
    return errorResponse(503, "NEXUM_MODEL_CONFIG_NOT_CONFIGURED", "Nexum Model Config 尚未配置", traceId)
  }
  return jsonResponse({ data: (await modelConfigStore.get()) ?? null }, traceId)
}

/** 更新并校验当前模型配置，错误时保留旧配置。 */
async function updateModelConfig(
  request: Request,
  modelConfigStore: NexumModelConfigStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!modelConfigStore) {
    return errorResponse(503, "NEXUM_MODEL_CONFIG_NOT_CONFIGURED", "Nexum Model Config 尚未配置", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (
    !isRecord(payload) ||
    typeof payload.baseUrl !== "string" ||
    typeof payload.model !== "string" ||
    (payload.credential !== undefined && typeof payload.credential !== "string") ||
    (payload.credentialRef !== undefined && typeof payload.credentialRef !== "string")
  ) {
    return errorResponse(400, "NEXUM_INVALID_MODEL_CONFIG", "模型配置字段无效", traceId)
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
    if (error instanceof NexumModelConfigError) {
      return errorResponse(400, "NEXUM_INVALID_MODEL_CONFIG", error.message, traceId)
    }
    return errorResponse(500, "NEXUM_MODEL_CONFIG_UPDATE_FAILED", "模型配置保存失败", traceId)
  }
}

/** 返回当前默认角色提示词。 */
async function getRolePrompt(
  rolePromptStore: NexumRolePromptStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!rolePromptStore) {
    return errorResponse(503, "NEXUM_ROLE_PROMPT_NOT_CONFIGURED", "默认角色提示词尚未配置", traceId)
  }
  return jsonResponse({ data: await rolePromptStore.get() }, traceId)
}

/** 保存默认角色提示词；只保存用户配置，不改变模型输出。 */
async function updateRolePrompt(
  request: Request,
  rolePromptStore: NexumRolePromptStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!rolePromptStore) {
    return errorResponse(503, "NEXUM_ROLE_PROMPT_NOT_CONFIGURED", "默认角色提示词尚未配置", traceId)
  }
  const payload = await request.json().catch(() => undefined)
  if (!isRecord(payload) || typeof payload.prompt !== "string") {
    return errorResponse(400, "NEXUM_INVALID_ROLE_PROMPT", "prompt 必须是字符串", traceId)
  }
  try {
    return jsonResponse({ data: await rolePromptStore.update(payload.prompt) }, traceId)
  } catch (error) {
    if (error instanceof NexumRolePromptError) {
      return errorResponse(400, "NEXUM_INVALID_ROLE_PROMPT", error.message, traceId)
    }
    return errorResponse(500, "NEXUM_ROLE_PROMPT_UPDATE_FAILED", "默认角色提示词保存失败", traceId)
  }
}

/** 恢复内置默认角色提示词。 */
async function resetRolePrompt(
  rolePromptStore: NexumRolePromptStore | undefined,
  traceId: string,
): Promise<Response> {
  if (!rolePromptStore) {
    return errorResponse(503, "NEXUM_ROLE_PROMPT_NOT_CONFIGURED", "默认角色提示词尚未配置", traceId)
  }
  try {
    return jsonResponse({ data: await rolePromptStore.reset() }, traceId)
  } catch {
    return errorResponse(500, "NEXUM_ROLE_PROMPT_RESET_FAILED", "默认角色提示词恢复失败", traceId)
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
              protocolVersion: NEXUM_PROTOCOL_VERSION,
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
        protocolVersion: NEXUM_PROTOCOL_VERSION,
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
    throw new Error("Nexum Service 端口必须是 0 到 65535 的整数")
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
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { value: String(error) }
  console.error("nexum.request_failed", {
    traceId,
    method: request.method,
    path: new URL(request.url).pathname,
    error: details,
  })
}
