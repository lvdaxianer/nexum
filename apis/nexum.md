# Nexum Runtime API

[中文](zh-CN/nexum.md)

This is the HTTP/SSE reference for Nexum Server. The base API prefix is
`/api/nexum`; the current experimental prefix is `/api/experimental/nexum`.
All responses use the versioned JSON envelope and Session events are available
as ordered SSE frames.

## Beginner request flow

1. `GET /api/nexum/capabilities` to discover the protocol and enabled features.
2. `POST /api/nexum/session` to create a Session, or `GET` to list Sessions.
3. `POST /api/nexum/session/{sessionID}/prompt` to submit user input.
4. `GET /api/nexum/session/{sessionID}/events` to stream progress.
5. `GET /api/nexum/session/{sessionID}/state` and the experimental `messages` endpoint to restore a UI.
6. Reply to Permission/Question requests, or use cancel/continue when appropriate.

## Health and capabilities

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health/live` | Process is alive |
| `GET` | `/health/ready` | Server is ready |
| `GET` | `/api/nexum/capabilities` | Protocol version, features, operations, and event types |

## Model and role prompt

| Method | Path | Body / query | Purpose |
| --- | --- | --- | --- |
| `GET` / `PUT` | `/api/nexum/model` | model configuration for `PUT` | Read or save model settings |
| `POST` | `/api/nexum/model/probe` | probe request | Check model capabilities |
| `GET` / `PUT` / `DELETE` | `/api/nexum/role-prompt` | `{ "prompt": "..." }` for `PUT` | Read, update, or reset the Runtime role prompt |

The role prompt is configured separately from a user's `session.prompt` text.
Do not send credentials back to the browser; use the backend's credential
reference/configuration boundary.

## Session resources

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/nexum/session` | List Sessions |
| `POST` | `/api/nexum/session` | Create a Session |
| `PUT` | `/api/nexum/session/{sessionID}` | Rename/update a Session |
| `DELETE` | `/api/nexum/session/{sessionID}` | Delete Session history and runtime records |
| `GET` | `/api/nexum/session/{sessionID}/state` | Read status, pending interactions, and event cursor |
| `GET` | `/api/experimental/nexum/session/{sessionID}/messages` | Read paginated canonical history |

### Create

```http
POST /api/nexum/session
Content-Type: application/json

{ "directory": "/workspace/demo", "name": "My Agent" }
```

`directory` is an absolute path on the Server host. The response contains the
stable `session.id`; use it for every later operation.

### List, switch, and restore

Call `GET /api/nexum/session` for the sidebar. When a user selects an item,
call `state` and `messages` for that ID, then subscribe to `events` using
`state.lastSequence` as `afterSequence`. Chat Surface performs this sequence
automatically when its `sessionID` changes.

### Rename and delete

```http
PUT /api/nexum/session/{sessionID}
Content-Type: application/json

{ "name": "Renamed Agent" }
```

```http
DELETE /api/nexum/session/{sessionID}
```

Deletion removes the Session, messages, interactions, and events while keeping
the working directory and model configuration. Treat it as a destructive user
action and refresh the Session list after success.

## Run control

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/nexum/session/{sessionID}/prompt` | `{ "text": "..." }` | Admit and run user input |
| `POST` | `/api/nexum/session/{sessionID}/cancel` | empty | Cancel the active run |
| `POST` | `/api/experimental/nexum/session/{sessionID}/continue` | `{}` | Continue from a recoverable User/Tool boundary |
| `GET` | `/api/nexum/session/{sessionID}/events` | `afterSequence` query | Subscribe to SSE |

`prompt` returns an accepted result before the run finishes. Use SSE and a
terminal event to determine completion; do not treat the HTTP response as the
final answer.

## Permission and Question

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/nexum/session/{sessionID}/permission` | List pending Permission requests |
| `POST` | `/api/nexum/session/{sessionID}/permission/{requestID}/reply` | Reply with `allow_once`, `allow_always`, or `deny` |
| `GET` | `/api/nexum/session/{sessionID}/question` | List pending Questions |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/reply` | Submit the ordered answer array |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/cancel` | Cancel a pending Question |

Every reply must include the current Session and request IDs. A stale or
cross-Session request is not safe to retry; refresh state and remove the old UI
card.

## Events and SSE

```http
GET /api/nexum/session/{sessionID}/events?afterSequence=42
Accept: text/event-stream
```

Each frame carries a JSON `NexumEvent` with `eventID`, `runID`, `sessionID`,
`sequence`, `type`, `occurredAt`, and type-specific `data`. Deduplicate by
`eventID`, keep events scoped to one Session, and reconnect from the last
processed sequence. Common event types include `assistant.text`,
`tool.request`, `tool.result`, `permission.requested`, `question.request`,
`context.compaction.*`, and `session.completed/failed/cancelled`.

## Skills and MCP

Skills are managed under `/api/nexum/skills`: list, detail, register, refresh,
validate, activate, and delete. MCP lifecycle endpoints are under
`/api/experimental/nexum/mcp`: list/register, connect, disconnect, delete, and
read tools/resources/prompts. OAuth uses an attempt ID with authorize, status,
complete, and cancel operations.

## Errors and authentication

Use the stable `errorCode` and optional `traceId` in the JSON envelope. Keep
Session/request IDs in the error context when showing a recoverable UI error.
Non-loopback deployments must configure authentication; health endpoints and
credential storage follow the Server deployment policy.

For complete field-level examples and the Chinese reference, use the [中文 API
document](zh-CN/nexum.md). For TypeScript calls, use the [Client module](../docs/modules/nexum-client.md).
