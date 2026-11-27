# `nexum/client`

[中文](../zh-CN/modules/nexum-client.md)

The Client is the TypeScript consumer for Nexum HTTP/SSE. Import it from
`nexum/client`.

## Public API

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
```

`Nexum.make(options)` accepts `baseUrl` (the Server base URL, without the API
path) and an optional `fetch` implementation for SSR, tests, or a host runtime.

### Session methods

| Method | Required | Optional | Purpose |
| --- | --- | --- | --- |
| `session.create(input)` | `directory` | `name` | Create a Session |
| `session.list()` | none | none | Query Sessions for a picker |
| `session.state(input)` | `sessionID` | none | Read status, pending interactions, and cursor |
| `session.messages(input)` | `sessionID` | `before`, `limit`, `snapshotID` | Read paginated history |
| `session.prompt(input)` | `sessionID`, `text` | none | Submit a user task |
| `session.continue(input)` | `sessionID` | none | Continue recoverable work |
| `session.cancel(input)` | `sessionID` | none | Cancel the current run |
| `session.events(input, options)` | `sessionID` | `afterSequence`, `signal` | Subscribe to SSE |

The current protocol exposes these methods under
`client.experimental.nexum.session`. `session.id` becomes the `sessionID` for
later calls. Configure the default role prompt separately with
`rolePrompt.update({ prompt })`; do not put it in `session.prompt`.

## Other groups

The Client also exposes capability discovery, model configuration, role prompt,
Permission, Question, Skill, MCP, and health methods. Their request/response
schemas are defined by [Protocol](nexum-protocol.md) and the [Runtime API](../../apis/nexum.md).

The Client validates JSON envelopes, protocol versions, SSE events, and stable
errors. It does not own Session rules or UI state.
