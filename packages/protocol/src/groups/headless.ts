/**
 * Headless Service 的实验性 Session、事件和权限协议。
 *
 * @author lvdaxianer@yeah.net
 * @date 2026-11-19
 */

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { InvalidRequestError, PermissionNotFoundError, SessionNotFoundError } from "../errors.js"

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

/** Headless Runtime 向 UI 推送的事件。 */
export const HeadlessEvent = Schema.Struct({
  type: Schema.String,
  sessionID: Schema.String,
  sequence: Schema.Number,
  data: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
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

/** Headless Service 的实验性 API group。 */
export const HeadlessGroup = HttpApiGroup.make("server.headless")
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
