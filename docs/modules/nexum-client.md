# `nexum-ai/client`

[中文](../zh-CN/modules/nexum-client.md)

The Client is the TypeScript consumer for Nexum HTTP/SSE. Import it from
`nexum-ai/client`.

## Public API

```ts
import { Nexum } from "nexum-ai/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
```

`Nexum.make(options)` accepts `baseUrl` (the Server base URL, without the API
path) and an optional `fetch` implementation for SSR, tests, or a host runtime.

### Session methods

| Method | Required | Optional | Purpose |
| --- | --- | --- | --- |
| `session.create(input)` | `directory` | `name`, `mode` (`plan` or `build`) | Create a Session |
| `session.list()` | none | none | Query Sessions for a picker |
| `session.state(input)` | `sessionID` | none | Read status, pending interactions, and cursor |
| `session.messages(input)` | `sessionID` | `before`, `limit`, `snapshotID` | Read paginated history |
| `session.setMode(input)` | `sessionID`, `mode` (`plan` or `build`) | none | Switch Agent mode while idle |
| `session.prompt(input)` | `sessionID`, `text` | none | Submit a user task |
| `session.continue(input)` | `sessionID` | none | Continue recoverable work |
| `session.cancel(input)` | `sessionID` | none | Cancel the current run |
| `session.events(input, options)` | `sessionID` | `afterSequence`, `signal` | Subscribe to SSE |

The current protocol exposes these methods under
`client.experimental.nexum.session`. `session.id` becomes the `sessionID` for
later calls. Configure the default role prompt separately with
`rolePrompt.update({ prompt })`; do not put it in `session.prompt`.

`session.create({ mode })` chooses the initial Agent mode for that Session. The
Application Runtime may provide `defaultAgentMode` for embedded callers, but an
explicit Session mode always wins; if neither is set, the Core default is
`build`.

Plan mode is the read-and-plan phase: Core permits reads and writes only below
`.nexum/plans/` and rejects business-file writes, Shell, MCP, and Skill
management before permission evaluation. Build mode keeps the normal execution
behavior. A running Session cannot switch modes.

## Other groups

The Client also exposes capability discovery, model configuration, role prompt,
Permission, Question, Skill, MCP, and health methods. Their request/response
schemas are defined by [Protocol](nexum-protocol.md) and the [Runtime API](../../apis/nexum.md).

The Client validates JSON envelopes, protocol versions, SSE events, and stable
errors. It does not own Session rules or UI state.

### Role prompt methods

| Method | Input | Purpose |
| --- | --- | --- |
| `rolePrompt.get()` | none | Read the current prompt and source |
| `rolePrompt.update({ prompt })` | `prompt` | Update the Runtime-level default role |
| `rolePrompt.reset()` | none | Restore the default prompt |

The role prompt is configured separately from `session.prompt({ text })`. The
former is a Runtime instruction; the latter is the user's current task.

### Other method groups

| Group | Methods | Purpose |
| --- | --- | --- |
| Capabilities | `capabilities()` | Discover enabled operations, events, and interactions |
| Model | `experimental.nexum.model.get/update/probe()` | Read, update, and probe model configuration |
| Permission | `session.permission.list/reply()` | Read pending requests and submit decisions |
| Permission policy | `experimental.nexum.permissionPolicy.list/create/update/remove()` | Manage policy rules |
| Question | `session.question.list/reply/cancel()` | Read, answer, or cancel Questions |
| Skill | `session.skill.list/detail/register/refresh/validate/unregister()` | Discover and manage Skills |

JSON requests use `Accept: application/json` and `Content-Type:
application/json`; SSE uses `Accept: text/event-stream`. Client errors expose a
stable code, status, message, and optional trace ID. An `AbortSignal` controls
the lifetime of an event subscription; the Surface owns event deduplication and
UI projection.
