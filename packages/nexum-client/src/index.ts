import {
  NEXUM_API_PREFIX,
  NEXUM_EXPERIMENTAL_API_PREFIX,
  NEXUM_PROTOCOL_VERSION,
  type JsonObject,
  type NexumCapabilities,
  type NexumEnvelope,
  type NexumErrorPayload,
  type NexumEvent,
  type NexumModelConfig,
  type NexumModelProbe,
  type NexumPermission,
  type NexumPermissionPolicyDeleteResult,
  type NexumPermissionPolicyList,
  type NexumPermissionPolicyRule,
  type NexumPermissionPolicyRuleInput,
  type NexumPermissionPolicyRuleUpdate,
  type NexumQuestion,
  type NexumRolePrompt,
  type NexumRolePromptInput,
  type NexumResponse,
  type NexumSession,
  type NexumSessionDeleteResult,
  type NexumSessionMessages,
  type NexumSessionState,
  type NexumSkillDeleteResult,
  type NexumSkillRegisterInput,
  type NexumSkillRefreshInput,
  type NexumSkill,
  type NexumMcpServer,
  type NexumMcpServerInput,
  type NexumMcpTool,
  type NexumMcpResource,
  type NexumMcpPrompt,
  type NexumMcpOAuthAttempt,
  type NexumMcpOAuthStartInput,
  type NexumMcpOAuthCompleteInput,
  type NexumPlugin,
  type NexumPluginActivationInput,
  type NexumPluginActivationResult,
  type NexumPluginDeactivationResult,
  type NexumPluginDetail,
} from "@nexum/protocol"

export type {
  JsonObject,
  NexumCapabilities,
  NexumEnvelope,
  NexumErrorPayload,
  NexumEvent,
  NexumModelConfig,
  NexumModelProbe,
  NexumMessage,
  NexumMessageToolCall,
  NexumPermission,
  NexumPermissionPolicyDeleteResult,
  NexumPermissionPolicyEffect,
  NexumPermissionPolicyList,
  NexumPermissionPolicyRule,
  NexumPermissionPolicyRuleInput,
  NexumPermissionPolicyRuleUpdate,
  NexumPermissionPolicyScope,
  NexumQuestion,
  NexumRolePrompt,
  NexumRolePromptInput,
  NexumResponse,
  NexumSession,
  NexumSessionDeleteResult,
  NexumSessionMessages,
  NexumSessionState,
  NexumSkillDeleteResult,
  NexumSkillRegisterInput,
  NexumSkillRefreshInput,
  NexumSkill,
  NexumMcpServer,
  NexumMcpServerInput,
  NexumMcpTool,
  NexumMcpResource,
  NexumMcpPrompt,
  NexumMcpOAuthAttempt,
  NexumMcpOAuthStartInput,
  NexumMcpOAuthCompleteInput,
  NexumPlugin,
  NexumPluginActivationInput,
  NexumPluginActivationResult,
  NexumPluginDeactivationResult,
  NexumPluginDetail,
} from "@nexum/protocol"

export type NexumFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type NexumClientOptions = {
  readonly baseUrl?: string
  readonly fetch?: NexumFetch
}

export type NexumEventOptions = {
  readonly signal?: AbortSignal
  readonly afterSequence?: number
  readonly headers?: Headers | ReadonlyArray<readonly [string, string]> | Record<string, string>
}

export class NexumClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly traceId?: string,
  ) {
    super(message)
    this.name = "NexumClientError"
  }
}

export const Nexum = {
  make(options: NexumClientOptions = {}) {
    const baseUrl = (options.baseUrl ?? "http://127.0.0.1:4097").replace(/\/$/, "")
    const fetcher = options.fetch ?? globalThis.fetch
    const request = <T>(path: string, init?: RequestInit) => requestJson<T>(fetcher, `${baseUrl}${NEXUM_API_PREFIX}${path}`, init)
    const experimentalRequest = <T>(path: string, init?: RequestInit) =>
      requestJson<T>(fetcher, `${baseUrl}${NEXUM_EXPERIMENTAL_API_PREFIX}${path}`, init)

    return {
      capabilities: () => request<NexumCapabilities>("/capabilities"),
      experimental: {
        nexum: {
          model: {
            get: () => request<NexumModelConfig | null>("/model"),
            update: (input: { readonly baseUrl: string; readonly model: string; readonly credential?: string; readonly credentialRef?: string }) =>
              request<NexumModelConfig>("/model", { method: "PUT", body: JSON.stringify(input) }),
            probe: (input: { readonly mode?: "text" | "function_calling" | "both" }) =>
              request<NexumModelProbe>("/model/probe", { method: "POST", body: JSON.stringify(input) }),
          },
          rolePrompt: {
            get: () => request<NexumRolePrompt>("/role-prompt"),
            update: (input: NexumRolePromptInput) =>
              request<NexumRolePrompt>("/role-prompt", { method: "PUT", body: JSON.stringify(input) }),
            reset: () => request<NexumRolePrompt>("/role-prompt", { method: "DELETE" }),
          },
          permissionPolicy: {
            list: (input: { readonly sessionID?: string } = {}) => {
              const query = new URLSearchParams()
              if (input.sessionID !== undefined) query.set("sessionID", input.sessionID)
              const suffix = query.size > 0 ? `?${query.toString()}` : ""
              return request<NexumPermissionPolicyList>(`/permission/policy${suffix}`)
            },
            create: (input: NexumPermissionPolicyRuleInput) =>
              request<NexumPermissionPolicyRule>("/permission/policy", { method: "POST", body: JSON.stringify(input) }),
            update: (input: { readonly ruleID: string } & NexumPermissionPolicyRuleUpdate) =>
              request<NexumPermissionPolicyRule>(`/permission/policy/${encodeURIComponent(input.ruleID)}`, {
                method: "PUT",
                body: JSON.stringify({
                  ...(input.action !== undefined ? { action: input.action } : {}),
                  ...(input.resource !== undefined ? { resource: input.resource } : {}),
                  ...(input.effect !== undefined ? { effect: input.effect } : {}),
                }),
              }),
            remove: (input: { readonly ruleID: string }) =>
              request<NexumPermissionPolicyDeleteResult>(`/permission/policy/${encodeURIComponent(input.ruleID)}`, {
                method: "DELETE",
              }),
          },
          session: {
            create: (input: { readonly directory: string; readonly name?: string }) =>
              request<NexumSession>("/session", { method: "POST", body: JSON.stringify(input) }),
            list: () => request<readonly NexumSession[]>("/session"),
            state: (input: { readonly sessionID: string }) => request<NexumSessionState>(`/session/${encodeURIComponent(input.sessionID)}/state`),
            messages: (input: {
              readonly sessionID: string
              readonly before?: number
              readonly limit?: number
              readonly snapshotID?: string
            }) => {
              const query = new URLSearchParams()
              if (input.before !== undefined) query.set("before", String(input.before))
              if (input.limit !== undefined) query.set("limit", String(input.limit))
              if (input.snapshotID !== undefined) query.set("snapshot", input.snapshotID)
              const suffix = query.size > 0 ? `?${query.toString()}` : ""
              return experimentalRequest<NexumSessionMessages>(
                `/session/${encodeURIComponent(input.sessionID)}/messages${suffix}`,
              )
            },
            update: (input: { readonly sessionID: string; readonly name: string }) =>
              request<NexumSession>(`/session/${encodeURIComponent(input.sessionID)}`, {
                method: "PUT",
                body: JSON.stringify({ name: input.name }),
              }),
            delete: (input: { readonly sessionID: string }) =>
              request<NexumSessionDeleteResult>(`/session/${encodeURIComponent(input.sessionID)}`, { method: "DELETE" }),
            prompt: (input: { readonly sessionID: string; readonly text: string }) =>
              request<{ readonly status: "accepted" }>(`/session/${encodeURIComponent(input.sessionID)}/prompt`, {
                method: "POST",
                body: JSON.stringify({ text: input.text }),
              }),
            continue: (input: { readonly sessionID: string }) =>
              experimentalRequest<{ readonly status: "accepted" }>(`/session/${encodeURIComponent(input.sessionID)}/continue`, {
                method: "POST",
                body: "{}",
              }),
            cancel: (input: { readonly sessionID: string }) =>
              request<{ readonly status: "cancelled" }>(`/session/${encodeURIComponent(input.sessionID)}/cancel`, { method: "POST" }),
            events: (input: { readonly sessionID: string }, eventOptions: NexumEventOptions = {}) =>
              requestEvents(
                fetcher,
                eventStreamUrl(baseUrl, input.sessionID, eventOptions.afterSequence),
                eventOptions,
              ),
            permission: {
              list: (input: { readonly sessionID: string }) =>
                request<readonly NexumPermission[]>(`/session/${encodeURIComponent(input.sessionID)}/permission`),
              reply: (input: { readonly sessionID: string; readonly requestID: string; readonly decision: "allow_once" | "allow_always" | "deny" }) =>
                request<{ readonly status: "approved" | "denied" }>(
                  `/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply`,
                  { method: "POST", body: JSON.stringify({ decision: input.decision }) },
                ),
            },
            question: {
              list: (input: { readonly sessionID: string }) =>
                request<readonly NexumQuestion[]>(`/session/${encodeURIComponent(input.sessionID)}/question`),
              reply: (input: { readonly sessionID: string; readonly requestID: string; readonly answers: readonly (readonly string[])[] }) =>
                request<{ readonly status: "answered" }>(
                  `/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/reply`,
                  { method: "POST", body: JSON.stringify({ answers: input.answers }) },
                ),
              cancel: (input: { readonly sessionID: string; readonly requestID: string }) =>
                request<{ readonly status: "cancelled" }>(
                  `/session/${encodeURIComponent(input.sessionID)}/question/${encodeURIComponent(input.requestID)}/cancel`,
                  { method: "POST" },
                ),
            },
          },
          skill: {
            list: () => request<readonly NexumSkill[]>("/skills"),
            detail: (input: { readonly id: string }) =>
              request<NexumSkill>(`/skills/${encodeURIComponent(input.id)}`),
            register: (input: NexumSkillRegisterInput) =>
              request<NexumSkill>("/skills/register", { method: "POST", body: JSON.stringify(input) }),
            refresh: (input: NexumSkillRefreshInput = {}) =>
              request<readonly NexumSkill[]>("/skills/refresh", { method: "POST", body: JSON.stringify(input) }),
            validate: (input: { readonly id?: string }) =>
              request<{ readonly valid: boolean; readonly data: readonly NexumSkill[] }>("/skills/validate", {
                method: "POST",
                body: JSON.stringify(input),
              }),
            unregister: (input: { readonly id: string }) =>
              request<NexumSkillDeleteResult>(`/skills/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
          },
          plugin: {
            list: () => request<readonly NexumPlugin[]>("/plugins"),
            detail: (input: { readonly id: string }) =>
              request<NexumPluginDetail>(`/plugins/${encodeURIComponent(input.id)}`),
            activate: (input: NexumPluginActivationInput & { readonly id: string }) =>
              request<NexumPluginActivationResult>(`/plugins/${encodeURIComponent(input.id)}/activate`, {
                method: "POST",
                body: JSON.stringify({ sessionID: input.sessionID, ...(input.source ? { source: input.source } : {}) }),
              }),
            deactivate: (input: { readonly id: string; readonly sessionID: string }) =>
              request<NexumPluginDeactivationResult>(`/plugins/${encodeURIComponent(input.id)}/deactivate`, {
                method: "POST",
                body: JSON.stringify({ sessionID: input.sessionID }),
              }),
          },
          mcp: {
            list: () => experimentalRequest<readonly NexumMcpServer[]>("/mcp"),
            add: (input: NexumMcpServerInput) =>
              experimentalRequest<NexumMcpServer>("/mcp", { method: "POST", body: JSON.stringify(input) }),
            connect: (input: { readonly id: string }) =>
              experimentalRequest<NexumMcpServer>(`/mcp/${encodeURIComponent(input.id)}/connect`, { method: "POST", body: "{}" }),
            disconnect: (input: { readonly id: string }) =>
              experimentalRequest<NexumMcpServer>(`/mcp/${encodeURIComponent(input.id)}/disconnect`, { method: "POST", body: "{}" }),
            remove: (input: { readonly id: string }) =>
              experimentalRequest<{ readonly id: string; readonly deleted: true }>(`/mcp/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
            tools: (input: { readonly id: string }) =>
              experimentalRequest<readonly NexumMcpTool[]>(`/mcp/${encodeURIComponent(input.id)}/tools`),
            resources: (input: { readonly id: string }) =>
              experimentalRequest<readonly NexumMcpResource[]>(`/mcp/${encodeURIComponent(input.id)}/resources`),
            prompts: (input: { readonly id: string }) =>
              experimentalRequest<readonly NexumMcpPrompt[]>(`/mcp/${encodeURIComponent(input.id)}/prompts`),
            authorize: (input: NexumMcpOAuthStartInput) =>
              experimentalRequest<NexumMcpOAuthAttempt>(`/mcp/${encodeURIComponent(input.id)}/oauth/authorize`, {
                method: "POST",
                body: JSON.stringify(input.url ? { url: input.url } : {}),
              }),
            authorizationStatus: (input: { readonly attemptID: string }) =>
              experimentalRequest<NexumMcpOAuthAttempt>(`/mcp/oauth/${encodeURIComponent(input.attemptID)}`),
            completeAuthorization: (input: { readonly attemptID: string; readonly redirectUrl: string }) =>
              experimentalRequest<NexumMcpOAuthAttempt>(`/mcp/oauth/${encodeURIComponent(input.attemptID)}/complete`, {
                method: "POST",
                body: JSON.stringify({ redirectUrl: input.redirectUrl } satisfies NexumMcpOAuthCompleteInput),
              }),
            cancelAuthorization: (input: { readonly attemptID: string }) =>
              experimentalRequest<NexumMcpOAuthAttempt>(`/mcp/oauth/${encodeURIComponent(input.attemptID)}/cancel`, {
                method: "POST",
                body: "{}",
              }),
          },
        },
      },
    }
  },
}

function eventStreamUrl(baseUrl: string, sessionID: string, afterSequence: number | undefined): URL {
  const url = new URL(`${baseUrl}${NEXUM_API_PREFIX}/session/${encodeURIComponent(sessionID)}/events`)
  if (afterSequence !== undefined) url.searchParams.set("afterSequence", String(afterSequence))
  return url
}

async function requestJson<T>(fetcher: NexumFetch, url: string, init?: RequestInit): Promise<NexumResponse<T>> {
  const response = await fetcher(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const payload = (await response.json()) as unknown
  if (!response.ok) throw readError(response.status, payload)
  if (!isEnvelope(payload)) throw new NexumClientError(response.status, "NEXUM_INVALID_RESPONSE", "Nexum 响应格式无效")
  return payload as NexumResponse<T>
}

async function* requestEvents(fetcher: NexumFetch, url: string | URL, options: NexumEventOptions): AsyncIterable<NexumEvent> {
  const headers = new Headers()
  if (options.headers instanceof Headers) options.headers.forEach((value, key) => headers.set(key, value))
  else if (Array.isArray(options.headers)) {
    for (const [key, value] of options.headers) headers.set(key, value)
  } else {
    for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value)
  }
  headers.set("accept", "text/event-stream")
  const response = await fetcher(url, { headers, signal: options.signal })
  if (!response.ok) throw readError(response.status, await response.json())
  if (!response.body) throw new NexumClientError(response.status, "NEXUM_EVENT_STREAM_EMPTY", "Nexum 事件流为空")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventData: string[] = []
  while (true) {
    const chunk = await reader.read()
    buffer += decoder.decode(chunk.value, { stream: !chunk.done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line === "") {
        const data = eventData.join("\n")
        eventData = []
        if (data) yield JSON.parse(data) as NexumEvent
        continue
      }
      if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart())
    }
    if (chunk.done) break
  }
}

function readError(status: number, payload: unknown): NexumClientError {
  if (isErrorPayload(payload)) return new NexumClientError(status, payload.errorCode, payload.message, payload.traceId)
  return new NexumClientError(status, "NEXUM_HTTP_ERROR", `Nexum 请求失败（${status}）`)
}

function isEnvelope(value: unknown): value is NexumEnvelope<unknown> {
  return isObject(value) && "data" in value && isObject(value.meta) && value.meta.protocolVersion === NEXUM_PROTOCOL_VERSION
}

function isErrorPayload(value: unknown): value is NexumErrorPayload {
  return isObject(value) && typeof value.errorCode === "string" && typeof value.message === "string"
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
