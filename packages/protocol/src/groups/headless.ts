/**
 * Headless Service 的实验性 Session、事件和权限协议。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import {
  InvalidRequestError,
  PermissionNotFoundError,
  QuestionNotFoundError,
  ServiceUnavailableError,
  SessionNotFoundError,
  SkillNotFoundError,
  UnauthorizedError,
} from "../errors.js"

/** Headless Session 的生命周期状态。 */
export const HeadlessSessionStatus = Schema.Literals(["idle", "running", "completed", "failed", "cancelled"])

/** Headless Session 的最小公开信息。 */
export const HeadlessSession = Schema.Struct({
  id: Schema.String,
  directory: Schema.String,
  status: HeadlessSessionStatus,
})

/** Headless Protocol v1 的公共响应元数据。 */
export const HeadlessResponseMeta = Schema.Struct({
  protocolVersion: Schema.Literal("headless.v1"),
  traceId: Schema.String,
})

/** Headless Protocol v1 的能力发现结果。 */
export const HeadlessCapabilities = Schema.Struct({
  protocolVersion: Schema.Literal("headless.v1"),
  transport: Schema.Struct({ http: Schema.Literal("json"), events: Schema.Literal("sse") }),
  features: Schema.Array(Schema.String),
  eventTypes: Schema.Array(Schema.String),
})

/** 页面刷新和断线恢复所需的安全状态快照。 */
export const HeadlessSessionState = Schema.Struct({
  session: HeadlessSession,
  pendingPermissions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      sessionID: Schema.String,
      action: Schema.String,
      resource: Schema.String,
      reason: Schema.optional(Schema.String),
    }),
  ),
  pendingQuestions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      sessionID: Schema.String,
      toolCallID: Schema.String,
      questions: Schema.Array(
        Schema.Struct({
          header: Schema.String,
          question: Schema.String,
          options: Schema.Array(Schema.Struct({ label: Schema.String, description: Schema.String })),
          multiple: Schema.optional(Schema.Boolean),
        }),
      ),
    }),
  ),
  lastSequence: Schema.Number,
})

/** Headless Session 创建请求。 */
export const HeadlessSessionCreatePayload = Schema.Struct({
  directory: Schema.String,
})

/** Headless Prompt 请求。 */
export const HeadlessPromptPayload = Schema.Struct({
  text: Schema.String,
})

/**
 * Headless Skill 的安全生命周期状态。
 */
export const HeadlessSkillStatus = Schema.Literals(["ready", "invalid", "conflict"])

/**
 * Headless Skill 的 mention 范围。
 */
export const HeadlessSkillMention = Schema.Struct({
  start: Schema.Number,
  end: Schema.Number,
  text: Schema.String,
})

/**
 * Headless Skill 的安全摘要。
 */
export const HeadlessSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  version: Schema.optional(Schema.String),
  digest: Schema.String,
  fileCount: Schema.Number,
  files: Schema.Array(Schema.String),
  status: HeadlessSkillStatus,
  diagnostics: Schema.Array(Schema.String),
})

/**
 * Headless Skill 激活后的 Prompt 附件。
 */
export const HeadlessSkillAttachment = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  text: Schema.String,
  mention: HeadlessSkillMention,
})

/**
 * Headless Skill 注入模型的系统消息。
 */
export const HeadlessSkillSystemMessage = Schema.Struct({
  role: Schema.Literal("system"),
  content: Schema.String,
  sourceID: Schema.String,
})

/**
 * Headless Skill 激活返回的 Prompt 增量。
 */
export const HeadlessSkillPrompt = Schema.Struct({
  skills: Schema.Array(HeadlessSkillAttachment),
  systemMessages: Schema.Array(HeadlessSkillSystemMessage),
})

/**
 * Headless Skill 注册请求。
 */
export const HeadlessSkillRegisterPayload = Schema.Struct({
  id: Schema.String,
})

/**
 * Headless Skill 校验请求。
 */
export const HeadlessSkillValidatePayload = Schema.Struct({
  id: Schema.optional(Schema.String),
})

/**
 * Headless Skill 校验返回体。
 */
export const HeadlessSkillValidation = Schema.Struct({
  valid: Schema.Boolean,
  data: Schema.Array(HeadlessSkill),
})

/**
 * Headless Skill 显式激活请求。
 */
export const HeadlessSkillActivatePayload = Schema.Struct({
  sessionID: Schema.String,
  text: Schema.String,
})

/** Headless 工具权限决策。 */
export const HeadlessPermissionDecision = Schema.Literals(["allow_once", "allow_always", "deny"])

/** Headless Session 的待审批权限请求。 */
export const HeadlessPermissionRequest = Schema.Struct({
  id: Schema.String,
  sessionID: Schema.String,
  action: Schema.String,
  resource: Schema.String,
  reason: Schema.optional(Schema.String),
})

/** Headless Question 的可选项。 */
export const HeadlessQuestionOption = Schema.Struct({
  label: Schema.String,
  description: Schema.String,
})

/** Headless Question 的单个问题。 */
export const HeadlessQuestionItem = Schema.Struct({
  header: Schema.String,
  question: Schema.String,
  options: Schema.Array(HeadlessQuestionOption),
  multiple: Schema.optional(Schema.Boolean),
})

/** Headless Runtime 暴露给 UI 的 pending Question。 */
export const HeadlessQuestionRequest = Schema.Struct({
  id: Schema.String,
  sessionID: Schema.String,
  toolCallID: Schema.String,
  questions: Schema.Array(HeadlessQuestionItem),
})

/** Question 的结构化回答请求体。 */
export const HeadlessQuestionAnswerPayload = Schema.Struct({
  answers: Schema.Array(Schema.Array(Schema.String)),
})

/** Question 生命周期状态。 */
export const HeadlessQuestionStatus = Schema.Literals(["pending", "answered", "cancelled"])

/** 上下文压缩生命周期状态。 */
export const HeadlessContextCompactionStatus = Schema.Literals(["started", "completed", "failed"])

/** 上下文压缩事件的结构化数据。 */
export const HeadlessContextCompactionEventData = Schema.Struct({
  status: HeadlessContextCompactionStatus,
  estimatedTokens: Schema.optional(Schema.Number),
  summaryLength: Schema.optional(Schema.Number),
  keptMessages: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.String),
})

/** Question 事件的结构化数据。 */
export const HeadlessQuestionEventData = Schema.Struct({
  requestID: Schema.String,
  toolCallID: Schema.String,
  questions: Schema.optional(Schema.Array(HeadlessQuestionItem)),
})

/** Headless Runtime 已定义的事件类型。 */
export const HeadlessEventType = Schema.Literals([
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
])

/** Headless Runtime 向 UI 推送的事件。 */
export const HeadlessEvent = Schema.Struct({
  eventID: Schema.String,
  runID: Schema.String,
  type: HeadlessEventType,
  sessionID: Schema.String,
  sequence: Schema.Number,
  occurredAt: Schema.String,
  data: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
})

/** Headless 单模型配置的安全返回体。 */
export const HeadlessModelConfig = Schema.Struct({
  baseUrl: Schema.String,
  model: Schema.String,
  credentialConfigured: Schema.Boolean,
  credentialRef: Schema.optional(Schema.String),
})

/** Headless 单模型配置请求体。 */
export const HeadlessModelConfigPayload = Schema.Struct({
  baseUrl: Schema.String,
  model: Schema.String,
  credential: Schema.optional(Schema.String),
  credentialRef: Schema.optional(Schema.String),
})

/** 页面模型能力探测模式。 */
export const HeadlessModelProbeMode = Schema.Literals(["text", "function_calling", "both"])

/** 模型能力探测请求。 */
export const HeadlessModelProbePayload = Schema.Struct({
  mode: Schema.optional(HeadlessModelProbeMode),
})

/** 模型能力探测的安全返回体。 */
export const HeadlessModelProbeResult = Schema.Struct({
  text: Schema.Literals(["pass", "skipped"]),
  functionCalling: Schema.Literals(["pass", "skipped"]),
})

const acceptedResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("accepted") }),
  meta: HeadlessResponseMeta,
})

const cancelledResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("cancelled") }),
  meta: HeadlessResponseMeta,
})

const permissionReplyResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literals(["approved", "denied"]) }),
  meta: HeadlessResponseMeta,
})

const questionReplyResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("answered") }),
  meta: HeadlessResponseMeta,
})

const questionCancelResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("cancelled") }),
  meta: HeadlessResponseMeta,
})

/** Headless Service 的实验性 API group。 */
export const HeadlessGroup = HttpApiGroup.make("server.headless")
  .add(
    HttpApiEndpoint.get("experimental.headless.capabilities", "/api/experimental/headless/capabilities", {
      success: Schema.Struct({ data: HeadlessCapabilities, meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.capabilities",
        summary: "Discover headless protocol capabilities",
        description: "Return the protocol version, transport, supported features, and event types.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("experimental.headless.model.get", "/api/experimental/headless/model", {
      success: Schema.Struct({ data: Schema.NullOr(HeadlessModelConfig), meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.model.get",
        summary: "Get the active headless model configuration",
        description: "Return the active model endpoint without returning credential values.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.put("experimental.headless.model.update", "/api/experimental/headless/model", {
      payload: HeadlessModelConfigPayload,
      success: Schema.Struct({ data: HeadlessModelConfig, meta: HeadlessResponseMeta }),
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.model.update",
        summary: "Update the active headless model configuration",
        description: "Validate and store one OpenAI-compatible model configuration without exposing credentials.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("experimental.headless.model.probe", "/api/experimental/headless/model/probe", {
      payload: HeadlessModelProbePayload,
      success: Schema.Struct({ data: HeadlessModelProbeResult, meta: HeadlessResponseMeta }),
      error: [InvalidRequestError, ServiceUnavailableError, UnauthorizedError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.model.probe",
        summary: "Probe headless model capabilities",
        description: "Run safe text and Function Calling checks without returning model content or credentials.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("experimental.headless.session.create", "/api/experimental/headless/session", {
      payload: HeadlessSessionCreatePayload,
      success: Schema.Struct({ data: HeadlessSession, meta: HeadlessResponseMeta }),
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.create",
        summary: "Create a headless session",
        description: "Create a UI-independent coding session at a validated working directory.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("experimental.headless.session.list", "/api/experimental/headless/session", {
      success: Schema.Struct({ data: Schema.Array(HeadlessSession), meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.list",
        summary: "List headless sessions",
        description: "List Session IDs, working directories, and lifecycle status for page recovery.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("experimental.headless.session.state", "/api/experimental/headless/session/:sessionID/state", {
      params: { sessionID: Schema.String },
      success: Schema.Struct({ data: HeadlessSessionState, meta: HeadlessResponseMeta }),
      error: SessionNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.state",
        summary: "Get a recoverable headless session state",
        description: "Return the safe session snapshot, pending decisions, and the latest event sequence.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("experimental.headless.skill.list", "/api/experimental/headless/skills", {
      success: Schema.Struct({ data: Schema.Array(HeadlessSkill), meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.list",
        summary: "List headless skills",
        description: "List safe Skill summaries without exposing host paths or credentials.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("experimental.headless.skill.detail", "/api/experimental/headless/skills/:skillID", {
      params: { skillID: Schema.String },
      success: Schema.Struct({ data: HeadlessSkill, meta: HeadlessResponseMeta }),
      error: SkillNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.detail",
        summary: "Get a headless skill",
        description: "Get one safe Skill summary by its stable ID.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("experimental.headless.skill.register", "/api/experimental/headless/skills/register", {
      payload: HeadlessSkillRegisterPayload,
      success: Schema.Struct({ data: HeadlessSkill, meta: HeadlessResponseMeta }),
      error: [InvalidRequestError, SkillNotFoundError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.register",
        summary: "Register an existing headless skill",
        description: "Refresh the configured project roots and idempotently admit an existing Skill ID.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("experimental.headless.skill.refresh", "/api/experimental/headless/skills/refresh", {
      success: Schema.Struct({ data: Schema.Array(HeadlessSkill), meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.refresh",
        summary: "Refresh headless skills",
        description: "Rescan the configured project Skill roots and return safe summaries.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("experimental.headless.skill.validate", "/api/experimental/headless/skills/validate", {
      payload: HeadlessSkillValidatePayload,
      success: Schema.Struct({ data: HeadlessSkillValidation, meta: HeadlessResponseMeta }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.validate",
        summary: "Validate headless skills",
        description: "Return safe validation status for all Skills or one requested ID.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.skill.activate",
      "/api/experimental/headless/skills/:skillID/activate",
      {
        params: { skillID: Schema.String },
        payload: HeadlessSkillActivatePayload,
        success: Schema.Struct({ data: HeadlessSkillPrompt, meta: HeadlessResponseMeta }),
        error: [InvalidRequestError, SessionNotFoundError, SkillNotFoundError],
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.skill.activate",
        summary: "Activate a headless skill",
        description: "Resolve one Skill mention for a Session through the existing PermissionPort.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.session.prompt",
      "/api/experimental/headless/session/:sessionID/prompt",
      {
        params: { sessionID: Schema.String },
        payload: HeadlessPromptPayload,
        success: acceptedResponse,
        error: [InvalidRequestError, SessionNotFoundError],
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.prompt",
        summary: "Send a prompt to a headless session",
        description: "Submit user text to the headless coding loop and return once it is accepted.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "experimental.headless.session.question.list",
      "/api/experimental/headless/session/:sessionID/question",
      {
        params: { sessionID: Schema.String },
        success: Schema.Struct({ data: Schema.Array(HeadlessQuestionRequest), meta: HeadlessResponseMeta }),
        error: SessionNotFoundError,
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.question.list",
        summary: "List pending headless questions",
        description: "List structured questions waiting for UI answers in a headless session.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.session.question.reply",
      "/api/experimental/headless/session/:sessionID/question/:requestID/reply",
      {
        params: { sessionID: Schema.String, requestID: Schema.String },
        payload: HeadlessQuestionAnswerPayload,
        success: questionReplyResponse,
        error: [InvalidRequestError, QuestionNotFoundError, SessionNotFoundError],
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.question.reply",
        summary: "Answer a pending headless question",
        description: "Submit ordered answers and resume the blocked headless coding loop.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.session.question.cancel",
      "/api/experimental/headless/session/:sessionID/question/:requestID/cancel",
      {
        params: { sessionID: Schema.String, requestID: Schema.String },
        success: questionCancelResponse,
        error: [QuestionNotFoundError, SessionNotFoundError],
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.question.cancel",
        summary: "Cancel a pending headless question",
        description: "Cancel a pending question without fabricating an answer for the model.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.session.cancel",
      "/api/experimental/headless/session/:sessionID/cancel",
      {
        params: { sessionID: Schema.String },
        success: cancelledResponse,
        error: SessionNotFoundError,
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.cancel",
        summary: "Cancel a headless session",
        description: "Request cancellation of the current coding loop turn.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "experimental.headless.session.events",
      "/api/experimental/headless/session/:sessionID/events",
      {
        params: { sessionID: Schema.String },
        success: HttpApiSchema.StreamSse({ data: HeadlessEvent }),
        error: SessionNotFoundError,
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.events",
        summary: "Subscribe to headless session events",
        description: "Subscribe to coding loop, tool, permission, and terminal session events.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get(
      "experimental.headless.session.permission.list",
      "/api/experimental/headless/session/:sessionID/permission",
      {
        params: { sessionID: Schema.String },
        success: Schema.Struct({ data: Schema.Array(HeadlessPermissionRequest), meta: HeadlessResponseMeta }),
        error: SessionNotFoundError,
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.permission.list",
        summary: "List headless permission requests",
        description: "List pending tool permission requests for a headless session.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post(
      "experimental.headless.session.permission.reply",
      "/api/experimental/headless/session/:sessionID/permission/:requestID/reply",
      {
        params: { sessionID: Schema.String, requestID: Schema.String },
        payload: Schema.Struct({ decision: HeadlessPermissionDecision }),
        success: permissionReplyResponse,
        error: [InvalidRequestError, PermissionNotFoundError, SessionNotFoundError],
      },
    ).annotateMerge(
      OpenApi.annotations({
        identifier: "experimental.headless.session.permission.reply",
        summary: "Reply to a headless permission request",
        description: "Approve once, approve always, or deny a pending headless tool request.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "headless",
      description: "Experimental UI-independent Session, event, and permission routes.",
    }),
  )

export type HeadlessSession = typeof HeadlessSession.Type
export type HeadlessResponseMeta = typeof HeadlessResponseMeta.Type
export type HeadlessCapabilities = typeof HeadlessCapabilities.Type
export type HeadlessSessionState = typeof HeadlessSessionState.Type
export type HeadlessEvent = typeof HeadlessEvent.Type
export type HeadlessPermissionRequest = typeof HeadlessPermissionRequest.Type
export type HeadlessPermissionDecision = typeof HeadlessPermissionDecision.Type
export type HeadlessQuestionOption = typeof HeadlessQuestionOption.Type
export type HeadlessQuestionItem = typeof HeadlessQuestionItem.Type
export type HeadlessQuestionRequest = typeof HeadlessQuestionRequest.Type
export type HeadlessQuestionAnswerPayload = typeof HeadlessQuestionAnswerPayload.Type
export type HeadlessQuestionStatus = typeof HeadlessQuestionStatus.Type
export type HeadlessContextCompactionStatus = typeof HeadlessContextCompactionStatus.Type
export type HeadlessContextCompactionEventData = typeof HeadlessContextCompactionEventData.Type
export type HeadlessQuestionEventData = typeof HeadlessQuestionEventData.Type
export type HeadlessEventType = typeof HeadlessEventType.Type
export type HeadlessModelProbeMode = typeof HeadlessModelProbeMode.Type
export type HeadlessModelProbePayload = typeof HeadlessModelProbePayload.Type
export type HeadlessModelProbeResult = typeof HeadlessModelProbeResult.Type
export type HeadlessSkillStatus = typeof HeadlessSkillStatus.Type
export type HeadlessSkill = typeof HeadlessSkill.Type
export type HeadlessSkillMention = typeof HeadlessSkillMention.Type
export type HeadlessSkillAttachment = typeof HeadlessSkillAttachment.Type
export type HeadlessSkillSystemMessage = typeof HeadlessSkillSystemMessage.Type
export type HeadlessSkillPrompt = typeof HeadlessSkillPrompt.Type
export type HeadlessSkillRegisterPayload = typeof HeadlessSkillRegisterPayload.Type
export type HeadlessSkillValidatePayload = typeof HeadlessSkillValidatePayload.Type
export type HeadlessSkillValidation = typeof HeadlessSkillValidation.Type
export type HeadlessSkillActivatePayload = typeof HeadlessSkillActivatePayload.Type
