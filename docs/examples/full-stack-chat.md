# Build a complete Agent application

[中文](../zh-CN/examples/full-stack-chat.md)

This beginner-friendly tutorial combines a SQLite runtime, an HTTP/SSE Server,
the Nexum Client, and Chat Surface. It also shows where Session APIs live and
how selecting a different Session replays its history.

```text
Chat Surface → Client + Surface Adapter → HTTP/SSE Server
             → Application + Core + SQLite Persistence → Model provider
```

## 1. Install Nexum

Nexum publishes one compiled package. Import public modules through subpaths:

```bash
npm install nexum
```

| Import | Purpose |
| --- | --- |
| `nexum/application` | Create Runtime, Session, and Coding Loop |
| `nexum/persistence/sqlite` | SQLite storage and recovery |
| `nexum/server` | HTTP/SSE boundary |
| `nexum/client` | Session requests and event subscription |
| `nexum/chat-surface` | Ready-made chat UI |

## 2. Create a SQLite runtime

```ts
import { createSqliteRuntime } from "nexum/application"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})
```

`databasePath` points to the SQLite file. It is not the Agent working
directory. SQLite persists Sessions, messages, events, interactions, and
runtime configuration.

## 3. Configure the model and role prompt

```ts
await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update(
  "You are a reliable project assistant. Be clear and do not invent execution results.",
)
```

`baseUrl` and `model` describe the upstream model provider. `credentialRef`
names the credential source read by the backend. `rolePrompt` is the default
system instruction; the user's task is supplied later as `text`.

See [Model / Runtime](../capabilities/model-runtime.md) and
[Integrations](../modules/nexum-integrations.md#public-api).

## 4. Expose the runtime through Server

```ts
import { startNexumServer } from "nexum/server"

const server = await startNexumServer({
  runtime,
  hostname: "127.0.0.1",
  port: 4097,
})
```

Server handles HTTP responses, SSE events, and stable errors. Runtime still
owns Session and Agent execution. Read the [Server module guide](../modules/nexum-server.md)
and [Runtime API](../../apis/nexum.md) for route details.

## 5. Create a Session from the client

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({ baseUrl: server.url })
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "My first Agent",
})
```

The `directory` is on the Server host. The returned `session.id` is the value
used by the prompt, history, event, and Chat Surface calls.

## 6. List and switch Sessions

Session APIs are grouped under `client.experimental.nexum.session`. Load the
list in your own sidebar and pass the selected ID to the chat area:

```tsx
const sessions = await client.experimental.nexum.session.list()

function selectSession(sessionID: string) {
  setSelectedSessionID(sessionID)
}
```

The main values are:

| Value | Use |
| --- | --- |
| `sessions` | Server-provided list for the Session picker |
| `selectedSessionID` | Current ID passed to Chat Surface |

For a manual UI, the Session API entry points are `list`, `state`, `messages`,
and `events`. `state()` restores status and pending interactions,
`messages()` restores history, and `events()` receives live changes.

## 7. Switch a Session and show its history

```tsx
import { ChatSurface } from "nexum/chat-surface"
import "nexum/chat-surface/styles.css"

<ChatSurface
  sessionID={selectedSessionID()}
  client={{ baseUrl: server.url }}
  title="My Agent"
/>
```

When `sessionID` changes, Chat Surface loads the selected Session's history and
state, subscribes to its SSE events, and renders the existing conversation. It
also handles streaming text, tool cards, Permission, Questions, cancellation,
continuation, refresh, and reconnect.

If you build the UI yourself:

```ts
const state = await client.experimental.nexum.session.state({ sessionID })
const history = await client.experimental.nexum.session.messages({ sessionID, limit: 50 })

for await (const event of client.experimental.nexum.session.events(
  { sessionID },
  { afterSequence: state.lastSequence },
)) {
  render(event)
}
```

Read the [Session guide](../capabilities/session.md) for rename, delete,
cancel, continue, pagination, and recovery. The tutorial keeps those
operations in one linked reference instead of duplicating them here.

## 8. Understand the data flow

1. The Client sends a Session or Prompt request to Server.
2. Server forwards the request to the composed Runtime.
3. Runtime folds the request into durable Session state and runs one step.
4. Runtime emits ordered events for text, tools, Permission, Questions, and terminal state.
5. Server streams those events over SSE.
6. Client or Chat Surface projects the events into UI state.

## Next references

- [Session capability](../capabilities/session.md)
- [Events and SSE](../capabilities/events.md)
- [Client API](../modules/nexum-client.md)
- [Chat Surface API](../modules/nexum-chat-surface.md)
- [Complete Runtime API](../../apis/nexum.md)
