/**
 * Headless Service 的实验性 Session、事件和权限协议。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { InvalidRequestError, PermissionNotFoundError, QuestionNotFoundError, SessionNotFoundError } from "../errors.js"

/** Headless Session 的生命周期状态。 */
export const HeadlessSessionStatus = Schema.Literals(["idle", "running", "completed", "failed", "cancelled"])

/** Headless Session 的最小公开信息。 */
export const HeadlessSession = Schema.Struct({
  id: Schema.String,
  directory: Schema.String,
  status: HeadlessSessionStatus,
})

/** Headless Session 创建请求。 */
export const HeadlessSessionCreatePayload = Schema.Struct({
  directory: Schema.String,
})

/** Headless Prompt 请求。 */
export const HeadlessPromptPayload = Schema.Struct({
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
  "question.request",
  "question.result",
  "question.cancelled",
  "context.compaction.started",
  "context.compaction.completed",
  "context.compaction.failed",
  "session.completed",
  "session.failed",
  "session.cancelled",
])

/** Headless Runtime 向 UI 推送的事件。 */
export const HeadlessEvent = Schema.Struct({
  type: HeadlessEventType,
  sessionID: Schema.String,
  sequence: Schema.Number,
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

const acceptedResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("accepted") }),
})

const cancelledResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("cancelled") }),
})

const permissionReplyResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literals(["approved", "denied"]) }),
})

const questionReplyResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("answered") }),
})

const questionCancelResponse = Schema.Struct({
  data: Schema.Struct({ status: Schema.Literal("cancelled") }),
})

/** Headless Service 的实验性 API group。 */
export const HeadlessGroup = HttpApiGroup.make("server.headless")
  .add(
    HttpApiEndpoint.get("experimental.headless.model.get", "/api/experimental/headless/model", {
      success: Schema.Struct({ data: Schema.NullOr(HeadlessModelConfig) }),
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
      success: Schema.Struct({ data: HeadlessModelConfig }),
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
    HttpApiEndpoint.post("experimental.headless.session.create", "/api/experimental/headless/session", {
      payload: HeadlessSessionCreatePayload,
      success: Schema.Struct({ data: HeadlessSession }),
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
        success: Schema.Struct({ data: Schema.Array(HeadlessQuestionRequest) }),
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
        success: Schema.Struct({ data: Schema.Array(HeadlessPermissionRequest) }),
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
