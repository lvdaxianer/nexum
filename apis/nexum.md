# Nexum Runtime API

[中文](zh-CN/nexum.md)

This is the HTTP/SSE reference for Nexum Server. The base API prefix is
`/api/nexum`; the current experimental prefix is `/api/experimental/nexum`.
All responses use the versioned JSON envelope and Session events are available
as ordered SSE frames.

| Item | Contract |
| --- | --- |
| Module | Nexum Runtime HTTP/SSE API (`apis/nexum.md`) |
| Responsibility | Expose Runtime capabilities, Session lifecycle, interactions, events, Skills, and MCP to a Client |
| Base prefixes | Stable `/api/nexum`; experimental `/api/experimental/nexum` |
| Callers | Nexum Client, Chat Surface, CLI, Web, desktop, and other-language clients |
| Authentication | Loopback may be anonymous; non-loopback requires the configured Bearer token |

### Controller/route coverage

| Route group | Endpoints documented in this module |
| --- | --- |
| Health and discovery | Health, capabilities, model, role prompt |
| Session | List/create, update/delete, mode, state, prompt, cancel, events, messages, continue |
| Human interaction | Permission requests, policy rules, Questions |
| Skills | List, detail, register, refresh, validate, activate, unregister |
| MCP | Registration, connection control, catalogs, OAuth |

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
| `PUT` | `/api/nexum/session/{sessionID}/mode` | Switch between Plan and Build Agent modes |
| `DELETE` | `/api/nexum/session/{sessionID}` | Delete Session history and runtime records |
| `GET` | `/api/nexum/session/{sessionID}/state` | Read status, pending interactions, and event cursor |
| `GET` | `/api/experimental/nexum/session/{sessionID}/messages` | Read paginated canonical history |

### Create

```http
POST /api/nexum/session
Content-Type: application/json

{ "directory": "/workspace/demo", "name": "My Agent", "mode": "plan" }
```

`directory` is an absolute path on the Server host. The response contains the
stable `session.id`; use it for every later operation. `mode` is optional and
defaults to `build`.

### Switch Agent mode

Plan mode is the read-and-plan phase. Core permits reads and writes under the
current workspace's `.nexum/plans/` directory, and rejects business-file writes,
Shell, MCP, and Skill-management calls before Permission evaluation. Build mode
keeps the normal tool and permission behavior. Mode is persisted with the
Session and cannot change while the Session status is `running`.

#### Method and URL

```http
PUT /api/nexum/session/{sessionID}/mode
Content-Type: application/json
Accept: application/json
```

| Parameter | Location | Type | Required | Values / constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `{sessionID}` | path | string | yes | URL-encoded Session ID | Target Session |
| `mode` | JSON body | string | yes | `plan` or `build` | Target Agent mode |

Request headers: `Content-Type: application/json` is required for a JSON body;
`Accept` is optional. Request cookies are not applicable. No idempotency key is
used; setting the already active mode is idempotent.

```bash
curl --request PUT 'http://127.0.0.1:4097/api/nexum/session/<SESSION_ID>/mode' \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --data '{"mode":"plan"}'
```

Successful response (`200 OK`):

```json
{
  "data": {
    "id": "session_01",
    "name": "My Agent",
    "directory": "/workspace/demo",
    "status": "idle",
    "mode": "plan",
    "createdAt": "2026-11-27T08:00:00.000Z",
    "updatedAt": "2026-11-27T08:01:00.000Z"
  },
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_mode_001"
  }
}
```

The response headers include `Content-Type: application/json` and
`x-trace-id`; response cookies are not applicable. The `mode` field is returned
by create, list, update, and state responses as well.

| HTTP status | `errorCode` | Meaning and caller action |
| --- | --- | --- |
| `400` | `NEXUM_INVALID_REQUEST` | Body is missing or `mode` is not `plan`/`build`; correct the request. |
| `404` | `NEXUM_SESSION_NOT_FOUND` | Session does not exist; refresh the Session list. |
| `409` | `NEXUM_SESSION_RUN_CONFLICT` | Session is running; wait for a terminal state or cancel it before switching. |
| `500` | `NEXUM_SESSION_MODE_UPDATE_FAILED` | Server-side update failure; retain the current UI mode and report the `traceId`. |

Example error (`409 Conflict`):

```json
{
  "errorCode": "NEXUM_SESSION_RUN_CONFLICT",
  "message": "Session 当前正在运行，不能切换 Agent 模式",
  "traceId": "trace_mode_002",
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_mode_002" }
}
```

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

For the Chinese translation, use the [中文 API document](zh-CN/nexum.md). For
TypeScript calls, use the [Client module](../docs/modules/nexum-client.md).

## Protocol conventions

### Authentication boundary

Loopback development can run without a token. A non-loopback Server must
configure authentication and a safe Host policy. The browser may receive a
credential reference or an authenticated session, but the Server must never
return the model credential, OAuth token, cookie, or secret in a response,
event, history item, or error detail.

### JSON envelope

Successful JSON responses use the versioned envelope:

```json
{
  "data": {},
  "meta": {
    "protocolVersion": "nexum.runtime.v1"
  }
}
```

Errors keep a stable `errorCode`, human-readable `message`, and optional
`traceId`. Clients should branch on `errorCode`, not on English message text.

## Route coverage

| Area | Stable routes | Experimental routes |
| --- | --- | --- |
| Health and discovery | `/health/live`, `/health/ready`, `/api/nexum/capabilities` | — |
| Model and role | `/api/nexum/model`, `/api/nexum/model/probe`, `/api/nexum/role-prompt` | — |
| Session | `/api/nexum/session`, `/api/nexum/session/{sessionID}`, `/api/nexum/session/{sessionID}/mode` | `messages`, `continue` |
| Run and events | `prompt`, `cancel`, `events` | — |
| Permission and Question | pending/list/reply/cancel routes | — |
| Skills | list/detail/register/refresh/validate/activate/unregister | — |
| MCP | — | `/api/experimental/nexum/mcp/...` |

Experimental routes may change without compatibility guarantees. Use the
generated Client namespace shown in the module documentation rather than
hard-coding a different path.

### Complete endpoint index

The following index keeps the public route list in one place. `{sessionID}`,
`{requestID}`, `{ruleID}`, `{id}`, and `{attemptID}` are URL path parameters and
must be encoded as path segments.

| Method | Path |
| --- | --- |
| `GET` | `/health/live` |
| `GET` | `/health/ready` |
| `GET` | `/api/nexum/capabilities` |
| `GET`, `PUT` | `/api/nexum/model` |
| `POST` | `/api/nexum/model/probe` |
| `GET`, `PUT`, `DELETE` | `/api/nexum/role-prompt` |
| `GET`, `POST` | `/api/nexum/session` |
| `PUT`, `DELETE` | `/api/nexum/session/{sessionID}` |
| `PUT` | `/api/nexum/session/{sessionID}/mode` |
| `GET` | `/api/nexum/session/{sessionID}/state` |
| `POST` | `/api/nexum/session/{sessionID}/prompt` |
| `POST` | `/api/nexum/session/{sessionID}/cancel` |
| `GET` | `/api/nexum/session/{sessionID}/events` |
| `GET` | `/api/nexum/session/{sessionID}/permission` |
| `POST` | `/api/nexum/session/{sessionID}/permission/{requestID}/reply` |
| `GET` | `/api/nexum/session/{sessionID}/question` |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/reply` |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/cancel` |
| `GET` | `/api/nexum/permission/policy` |
| `POST` | `/api/nexum/permission/policy` |
| `PUT` | `/api/nexum/permission/policy/{ruleID}` |
| `DELETE` | `/api/nexum/permission/policy/{ruleID}` |
| `GET` | `/api/nexum/skills` |
| `GET` | `/api/nexum/skills/{id}` |
| `POST` | `/api/nexum/skills/register` |
| `POST` | `/api/nexum/skills/refresh` |
| `POST` | `/api/nexum/skills/validate` |
| `POST` | `/api/nexum/skills/{id}/activate` |
| `DELETE` | `/api/nexum/skills/{id}` |
| `GET` | `/api/experimental/nexum/session/{sessionID}/messages` |
| `POST` | `/api/experimental/nexum/session/{sessionID}/continue` |
| `GET` | `/api/experimental/nexum/mcp` |
| `POST` | `/api/experimental/nexum/mcp` |
| `POST` | `/api/experimental/nexum/mcp/{id}/connect` |
| `POST` | `/api/experimental/nexum/mcp/{id}/disconnect` |
| `DELETE` | `/api/experimental/nexum/mcp/{id}` |
| `GET` | `/api/experimental/nexum/mcp/{id}/tools` |
| `GET` | `/api/experimental/nexum/mcp/{id}/resources` |
| `GET` | `/api/experimental/nexum/mcp/{id}/prompts` |
| `POST` | `/api/experimental/nexum/mcp/{id}/oauth/authorize` |
| `GET` | `/api/experimental/nexum/mcp/oauth/{attemptID}` |
| `POST` | `/api/experimental/nexum/mcp/oauth/{attemptID}/complete` |
| `POST` | `/api/experimental/nexum/mcp/oauth/{attemptID}/cancel` |

## Health, capabilities, and model details

### Health

`GET /health/live` reports that the process is alive. `GET /health/ready`
reports that the Server can accept Runtime requests. Both are lightweight JSON
responses and may be called anonymously; they do not require a request body or
cookie. A caller should use the readiness result before creating a Session.

### Capabilities

`GET /api/nexum/capabilities` returns the protocol version, enabled feature
names, supported operations, event types, and interaction capabilities. Use the
returned status instead of assuming that an optional Model, Skill, Question, or
MCP port is configured.

### `GET` and `PUT /api/nexum/model`

The public model view contains safe configuration only:

| Field | Type | Meaning |
| --- | --- | --- |
| `baseUrl` | string | Upstream OpenAI-compatible endpoint |
| `model` | string | Upstream model name |
| `credentialConfigured` | boolean | Whether the backend has credentials |
| `credentialRef` | string, optional | Name/reference of the backend credential source |

`PUT` accepts the model configuration and saves it through the Runtime store.
It must not include credentials in a browser-visible response.

### `POST /api/nexum/model/probe`

The optional body is `{ "mode": "text" | "function_calling" | "both" }`;
the default is `both`. A successful probe reports capability status, not model
content or credential values. Invalid mode, missing configuration, upstream
authentication, timeout, and provider failures have distinct stable error
codes.

### Role prompt

`GET /api/nexum/role-prompt` returns `{ prompt, source, updatedAt? }`.
`PUT` accepts `{ "prompt": "..." }` with a non-empty string, and `DELETE`
restores the built-in default. The role prompt is injected as a Runtime system
message before model execution and is not copied into Session history. It is
not the same field as `session.prompt({ text })`.

## Detailed Session requests

### `GET /api/nexum/session`

Returns `NexumSession[]`. Use it to render a sidebar. The response includes the
stable `id`, display `name`, working `directory`, lifecycle `status`, persisted
Agent `mode`, and other safe summary fields. It does not include the full message history.

### `POST /api/nexum/session`

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `directory` | `string` | yes | Absolute working directory on the Server host |
| `name` | `string` | no | User-facing display label |
| `mode` | `string` | no | `plan` or `build`; defaults to `build` |

The response contains the newly created stable `session.id`. With File or
SQLite Persistence, the Session record is written to the backend store before
the response is returned. The browser must use the returned ID for later calls.

### `PUT /api/nexum/session/{sessionID}`

Use this endpoint to change the display name:

```json
{
  "name": "Renamed Agent"
}
```

This does not change the working directory, history, role prompt, or model.
Refresh the list or replace the local sidebar snapshot after success.

### `PUT /api/nexum/session/{sessionID}/mode`

Accepts `{ "mode": "plan" | "build" }` and returns the updated Session
snapshot. Plan mode allows read operations and writes below `.nexum/plans/` only;
Core rejects business-file writes, Shell, MCP, and Skill-management calls before
Permission evaluation. Build mode retains the regular tool and permission
behavior. The mode is persisted and a running Session cannot switch modes.

### `DELETE /api/nexum/session/{sessionID}`

Deletion is durable and destructive. It removes the Session's messages,
interactions, events, and runtime records according to the Persistence adapter;
it does not delete the working directory or global model configuration. The UI
should ask for confirmation, then clear the selected ID after success.

### `GET /api/nexum/session/{sessionID}/state`

Returns `NexumSessionState`, including the Session snapshot, `canContinue`,
pending Permission and Question requests, and `lastSequence`. It is the first
request after a page load or reconnect.

## Session history

### `GET /api/experimental/nexum/session/{sessionID}/messages`

Query parameters:

| Parameter | Type | Meaning |
| --- | --- | --- |
| `before` | string | Page boundary for older messages |
| `limit` | non-negative integer | Maximum number of messages |
| `snapshotID` | string | Keep pagination stable while new messages arrive |

The response is `NexumSessionMessages` with `messages`, `total`, `hasMore`, and
an optional `snapshotID`. Load `state()` first, load the initial history, then
subscribe to events from `state.lastSequence`. A custom UI should follow this
same order when switching Sessions.

## Run control details

### Prompt

```http
POST /api/nexum/session/{sessionID}/prompt
Content-Type: application/json

{ "text": "Summarize this project" }
```

The response only confirms durable admission. The model result arrives through
SSE. `text` is the user's current task; the Runtime role prompt is configured
separately through `/api/nexum/role-prompt`.

### Cancel and continue

`POST /api/nexum/session/{sessionID}/cancel` requests cancellation of the active
run and pending interaction. `POST
/api/experimental/nexum/session/{sessionID}/continue` resumes only when state
reports that continuation is allowed. Both operations should be followed by a
state read and event subscription.

## Permission policy

Pending requests are Session-scoped:

```http
GET /api/nexum/session/{sessionID}/permission
POST /api/nexum/session/{sessionID}/permission/{requestID}/reply
```

The reply decision is one of `allow_once`, `allow_always`, or `deny`. Policy
rules are managed separately:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/nexum/permission/policy` | List rules |
| `POST` | `/api/nexum/permission/policy` | Create a rule |
| `PUT` | `/api/nexum/permission/policy/{ruleID}` | Update a rule |
| `DELETE` | `/api/nexum/permission/policy/{ruleID}` | Remove a rule |

The server validates the request ID and owning Session. A stale, missing, or
cross-Session ID must return a stable error; the client should refresh rather
than retry the old card.

## Question operations

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/nexum/session/{sessionID}/question` | — |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/reply` | Ordered two-dimensional answer array |
| `POST` | `/api/nexum/session/{sessionID}/question/{requestID}/cancel` | — |

The answer array preserves the original Question order and supports both
single- and multi-select options. A UI should disable duplicate submission,
observe the matching event, and refresh state after a protocol error.

## Skill registration

Skill operations use safe summaries and never return absolute source paths,
secrets, or raw command output:

| Operation | Purpose |
| --- | --- |
| list/detail | Read registered Skill metadata and diagnostics |
| register | Register a normalized source address |
| refresh | Rescan the source and update the digest/status |
| validate | Check the source without activating it |
| activate | Use a ready Skill for a Session after Permission |
| unregister | Remove the registry entry without deleting source files |

`ready`, `invalid`, and `conflict` are distinct states. A duplicate Skill ID
is not silently selected. Activation emits `skill.activated` or `skill.failed`.

## MCP lifecycle and OAuth

The experimental prefix is `/api/experimental/nexum`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/mcp` | List safe connection status |
| `POST` | `/mcp` | Register a remote URL |
| `POST` | `/mcp/{id}/connect` | Connect |
| `POST` | `/mcp/{id}/disconnect` | Disconnect |
| `DELETE` | `/mcp/{id}` | Remove registration |
| `GET` | `/mcp/{id}/tools` | Read tools |
| `GET` | `/mcp/{id}/resources` | Read resources |
| `GET` | `/mcp/{id}/prompts` | Read prompts |

OAuth is an attempt lifecycle: create an authorization attempt, query its
status, complete it with a loopback/redirect URL, or cancel it. Tokens and
client secrets are stored on the backend and are not returned by these routes.

## Event semantics

The SSE request is:

```http
GET /api/nexum/session/{sessionID}/events?afterSequence=42
Accept: text/event-stream
```

Each frame contains an event ID and a JSON `NexumEvent`. Clients should store
both `eventID` and `sequence`, deduplicate by event ID, and keep events scoped to
one Session. Terminal events are `session.completed`, `session.failed`, and
`session.cancelled`; `run.settled` can be used to release a local busy lock.

## Minimal client example

```ts
const sessions = await client.experimental.nexum.session.list()
const sessionID = sessions[0]?.id

if (sessionID) {
  const state = await client.experimental.nexum.session.state({ sessionID })
  const history = await client.experimental.nexum.session.messages({ sessionID, limit: 50 })

  for await (const event of client.experimental.nexum.session.events(
    { sessionID },
    { afterSequence: state.lastSequence },
  )) {
    render(history, event)
  }
}
```

This is the complete restore pattern: query the Session, read its state and
history, then subscribe from the returned cursor. For the beginner walkthrough,
see [Build a complete Agent application](../docs/examples/full-stack-chat.md).
