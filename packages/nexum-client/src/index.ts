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
  type NexumQuestion,
  type NexumResponse,
  type NexumSession,
  type NexumSessionDeleteResult,
  type NexumSessionState,
  type NexumSkillDeleteResult,
  type NexumSkillRegisterInput,
  type NexumSkillRefreshInput,
  type NexumSkill,
} from "@nexum/protocol"

export type {
  JsonObject,
  NexumCapabilities,
  NexumEnvelope,
  NexumErrorPayload,
  NexumEvent,
  NexumModelConfig,
  NexumModelProbe,
  NexumPermission,
  NexumQuestion,
  NexumResponse,
  NexumSession,
  NexumSessionDeleteResult,
  NexumSessionState,
  NexumSkillDeleteResult,
  NexumSkillRegisterInput,
  NexumSkillRefreshInput,
  NexumSkill,
} from "@nexum/protocol"

export type NexumFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type NexumClientOptions = {
  readonly baseUrl?: string
  readonly fetch?: NexumFetch
}

export type NexumEventOptions = {
  readonly signal?: AbortSignal
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
          session: {
            create: (input: { readonly directory: string; readonly name?: string }) =>
              request<NexumSession>("/session", { method: "POST", body: JSON.stringify(input) }),
            list: () => request<readonly NexumSession[]>("/session"),
            state: (input: { readonly sessionID: string }) => request<NexumSessionState>(`/session/${encodeURIComponent(input.sessionID)}/state`),
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
              requestEvents(fetcher, `${baseUrl}${NEXUM_API_PREFIX}/session/${encodeURIComponent(input.sessionID)}/events`, eventOptions),
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
        },
      },
    }
  },
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

async function* requestEvents(fetcher: NexumFetch, url: string, options: NexumEventOptions): AsyncIterable<NexumEvent> {
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
