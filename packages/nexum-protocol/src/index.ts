export const NEXUM_PROTOCOL_VERSION = "nexum.runtime.v1" as const
export const NEXUM_API_PREFIX = "/api/nexum" as const
export const NEXUM_EXPERIMENTAL_API_PREFIX = "/api/experimental/nexum" as const

export type JsonObject = Record<string, unknown>

export const NEXUM_EVENT_TYPES = [
  "assistant.thinking",
  "assistant.reasoning",
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
  "skill.updated",
  "skill.activated",
  "skill.failed",
  "model.attempt",
  "model.retry",
  "coding-loop.limit.reached",
  "session.completed",
  "session.failed",
  "session.cancelled",
  "run.settled",
] as const

export type NexumEventType = (typeof NEXUM_EVENT_TYPES)[number]

export type NexumThinkingEventData = {
  readonly message?: string
  readonly elapsedMs?: number
}

export type NexumReasoningEventData = {
  readonly content: string
}

export type NexumTextEventData = {
  readonly content: string
}

export type NexumModelErrorCode =
  | "not_configured"
  | "authentication_failed"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "upstream_error"
  | "invalid_request"
  | "unavailable"
  | "context_overflow"
  | "invalid_response"

export type NexumModelAttemptEventData = {
  readonly attempt: number
  readonly maxRetries: number
}

export type NexumModelRetryEventData = {
  readonly attempt: number
  readonly maxRetries: number
  readonly delayMs: number
  readonly errorCode?: NexumModelErrorCode
  readonly willRetry: true
}

export type NexumRunSettledEventData = {
  readonly result: "completed" | "failed" | "cancelled"
}

export type NexumEventDataByType = {
  "skill.updated": NexumSkillRegistryUpdateEventData
  "model.attempt": NexumModelAttemptEventData
  "model.retry": NexumModelRetryEventData
  "run.settled": NexumRunSettledEventData
}

export type NexumEnvelope<T> = {
  readonly data: T
  readonly meta: {
    readonly protocolVersion: typeof NEXUM_PROTOCOL_VERSION
    readonly traceId: string
  }
}

export type NexumErrorPayload = {
  readonly errorCode: string
  readonly message: string
  readonly traceId: string
  readonly meta: {
    readonly protocolVersion: typeof NEXUM_PROTOCOL_VERSION
    readonly traceId: string
  }
}

export type NexumCapabilities = {
  readonly protocolVersion: typeof NEXUM_PROTOCOL_VERSION
  readonly transport: { readonly http: "json"; readonly events: "sse" }
  readonly features: readonly string[]
  readonly eventTypes: readonly string[]
  readonly capabilities: readonly NexumCapability[]
}

export type NexumCapability = {
  readonly id: string
  readonly version: string
  readonly status: "enabled" | "disabled"
  readonly operations: readonly string[]
}

export type NexumModelConfig = {
  readonly baseUrl: string
  readonly model: string
  readonly credentialConfigured: boolean
  readonly credentialRef?: string
}

export type NexumRolePrompt = {
  readonly prompt: string
  readonly source: "default" | "custom"
  readonly updatedAt?: string
}

export type NexumRolePromptInput = {
  readonly prompt: string
}

export type NexumSessionStatus = "idle" | "running" | "completed" | "failed" | "cancelled"

export type NexumSession = {
  readonly id: string
  readonly name: string
  readonly directory: string
  readonly status: NexumSessionStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export type NexumSessionDeleteResult = {
  readonly id: string
  readonly deleted: true
}

export type NexumPermission = {
  readonly id: string
  readonly sessionID: string
  readonly action: string
  readonly resource: string
  readonly reason?: string
}

export type NexumQuestion = {
  readonly id: string
  readonly sessionID: string
  readonly toolCallID: string
  readonly questions: readonly {
    readonly header: string
    readonly question: string
    readonly options: readonly { readonly label: string; readonly description: string }[]
    readonly multiple?: boolean
  }[]
}

export type NexumSkill = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly version?: string
  readonly digest: string
  readonly fileCount: number
  readonly files: readonly string[]
  readonly status: "ready" | "invalid" | "conflict"
  readonly diagnostics: readonly string[]
  readonly sourceType?: "local-directory"
  readonly registeredAt?: string
  readonly updatedAt?: string
}

export type NexumSkillRegistryUpdateEventData = {
  readonly change: "registered" | "refreshed" | "validated" | "unregistered"
  readonly skillID: string
  readonly status?: NexumSkill["status"]
}

export type NexumSkillRegisterInput = {
  readonly address: string
}

export type NexumSkillRefreshInput = {
  readonly id?: string
}

export type NexumSkillDeleteResult = {
  readonly id: string
  readonly deleted: true
}

export type NexumSessionState = {
  readonly session: NexumSession
  readonly canContinue: boolean
  readonly pendingPermissions: readonly NexumPermission[]
  readonly pendingQuestions: readonly NexumQuestion[]
  readonly lastSequence: number
}

export type NexumEvent<T extends NexumEventType = NexumEventType> = {
  readonly eventID: string
  readonly runID: string
  readonly type: T
  readonly sessionID: string
  readonly sequence: number
  readonly occurredAt: string
  readonly data?: T extends keyof NexumEventDataByType ? NexumEventDataByType[T] : JsonObject
}

export type NexumModelProbe = {
  readonly text: "pass" | "skipped"
  readonly functionCalling: "pass" | "skipped"
}

export type NexumResponse<T> = NexumEnvelope<T>
