# Build a complete Agent application

[中文](../zh-CN/examples/full-stack-chat.md)

This beginner-friendly tutorial builds a small Agent application from zero:
the backend stores data in SQLite and exposes HTTP/SSE, while the frontend
uses Nexum Client and Chat Surface to display the chat UI.

When you finish, the composition looks like this:

```text
Frontend Chat Surface
        ↓
Client + Surface Adapter
        ↓ HTTP/SSE
Nexum Server
        ↓
Application + Core + SQLite Persistence
        ↓
Model provider
```

## Step 1: Install Nexum

Nexum publishes one `nexum` package. Import public modules through subpaths:

```bash
npm install nexum-ai
```

| Entry point | Purpose |
| --- | --- |
| [`nexum-ai/application`](../modules/nexum-application.md) | Create the Runtime, Session, and Coding Loop |
| [`nexum-ai/persistence/sqlite`](../modules/nexum-persistence-sqlite.md) | Store Sessions, messages, and events |
| [`nexum-ai/server`](../modules/nexum-server.md) | Provide the HTTP/SSE boundary |
| [`nexum-ai/client`](../modules/nexum-client.md) | Create Sessions, submit Prompts, and subscribe to events |
| [`nexum-ai/chat-surface`](../modules/nexum-chat-surface.md) | Render the chat UI |

## Step 2: Create the backend Runtime

The Runtime is where the Agent actually runs. It owns Sessions, models, tools,
permissions, and events.

```ts
import { createSqliteRuntime } from "nexum-ai/application"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})
```

`databasePath` is the SQLite file used by the backend. It is not the Agent's
working directory:

- `databasePath` stores Sessions, messages, events, and configuration;
- `directory` tells the Agent which project directory it may work in.

See [SQLite Persistence API](../modules/nexum-persistence-sqlite.md#public-api)
for the storage options.

## Step 3: Configure the model and role prompt

After creating the Runtime, configure the upstream model and the role the
Agent should play:

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

| Parameter | Meaning |
| --- | --- |
| `baseUrl` | Model provider URL, not the Nexum Server URL |
| `model` | Model name at the provider |
| `credentialRef` | Environment/config reference read by the backend |
| `rolePrompt` | Default Agent role, injected as a system message |

The role prompt is configured once for the Runtime. The user's current task is
passed later through `text`; it does not need to repeat the role prompt.
Read [Model / Runtime](../capabilities/model-runtime.md) and
[Integrations API](../modules/nexum-integrations.md#public-api) for more.

## Step 4: Expose the Runtime through Server

Pass the composed Runtime to Server:

```ts
import { startNexumServer } from "nexum-ai/server"

const server = await startNexumServer({
  runtime,
  hostname: "127.0.0.1",
  port: 4097,
})

console.log(`Nexum Server: ${server.url}`)
```

Server is responsible for:

- accepting Session and Prompt requests from the frontend;
- converting Runtime state into JSON responses;
- streaming text, tool, Permission, Question, and terminal events over SSE;
- returning stable error codes.

Server does not own Agent execution. See the [Nexum Runtime API](../../apis/nexum.md).

## Step 5: Create a Session from the frontend

The frontend connects to Server through `nexum-ai/client` and creates a Session:

```ts
import { Nexum } from "nexum-ai/client"

const API_BASE_URL = "http://127.0.0.1:4097"
const client = Nexum.make({ baseUrl: API_BASE_URL })

const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "My first Agent",
})
```

`directory` is an absolute path on the backend host, not a path on the browser
user's computer. A real application normally derives it from a selected
project or workspace and does not let the browser submit arbitrary paths.

The returned `session.id` is the Session identifier passed to later calls and
to Chat Surface. All Session operations are listed in the [Session capability
guide](../capabilities/session.md): list, switch, history, rename, delete,
cancel, and continue.

## Step 6: Query and switch existing Sessions

A real application usually renders a Session list in a sidebar. The list comes
from the backend SQLite store; the frontend never reads the database directly:

```tsx
import { For, Show, createSignal, onMount } from "solid-js"
import { Nexum, type NexumSession } from "nexum-ai/client"

const API_BASE_URL = "http://127.0.0.1:4097"

export function SessionPicker(props: { onSelect: (sessionID: string) => void }) {
  const client = Nexum.make({ baseUrl: API_BASE_URL })
  const [sessions, setSessions] = createSignal<readonly NexumSession[]>([])
  const [selectedSessionID, setSelectedSessionID] = createSignal<string>()

  onMount(async () => {
    const nextSessions = await client.experimental.nexum.session.list()
    setSessions(nextSessions)
    if (nextSessions[0]) {
      setSelectedSessionID(nextSessions[0].id)
      props.onSelect(nextSessions[0].id)
    }
  })

  async function createSession() {
    const session = await client.experimental.nexum.session.create({
      directory: "/workspace/demo",
      name: `New Agent ${sessions().length + 1}`,
    })
    setSessions((current) => [session, ...current])
    setSelectedSessionID(session.id)
    props.onSelect(session.id)
  }

  return (
    <aside>
      <button type="button" onClick={() => void createSession()}>
        New Session
      </button>
      <For each={sessions()} fallback={<p>No Sessions yet</p>}>
        {(session) => (
          <button
            type="button"
            onClick={() => {
              setSelectedSessionID(session.id)
              props.onSelect(session.id)
            }}
          >
            {session.name} · {session.status}
          </button>
        )}
      </For>
      <Show when={selectedSessionID()}>
        {(sessionID) => <p>Selected Session: {sessionID()}</p>}
      </Show>
    </aside>
  )
}
```

The two important values are:

| Value | Purpose |
| --- | --- |
| `sessions` | Server-provided list used to render the picker |
| `selectedSessionID` | The selected ID that drives the chat area |

Call `session.list()` again when the sidebar needs refreshing. The API entry
point is `client.experimental.nexum.session`; parameter and return-value
details are in [Client Session methods](../modules/nexum-client.md#session-methods).

## Step 7: Switch a Session and show its history

Pass the selected `sessionID` to Chat Surface. Clicking another Session only
needs to update this value:

```tsx
import { Show, createSignal } from "solid-js"
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"

const API_BASE_URL = "http://127.0.0.1:4097"

export function App() {
  const [selectedSessionID, setSelectedSessionID] = createSignal<string>()

  return (
    <div>
      <SessionPicker onSelect={setSelectedSessionID} />
      <main>
        <Show when={selectedSessionID()} fallback={<p>Select a Session first</p>}>
          <ChatSurface
            sessionID={selectedSessionID()!}
            client={{ baseUrl: API_BASE_URL }}
            title="My Agent"
          />
        </Show>
      </main>
    </div>
  )
}
```

After `sessionID` changes, Chat Surface automatically:

- loads Session history;
- loads the current Session state;
- subscribes to SSE events;
- shows streaming text and tool calls;
- displays Permission requests and submits decisions;
- displays Questions and submits answers;
- supports cancel and continue;
- restores state after refresh or reconnect.

The UI does not implement the Coding Loop or infer run state by parsing model
text. It consumes [Protocol](../modules/nexum-protocol.md) and [Client](../modules/nexum-client.md)
through [Surface Adapter](../modules/nexum-surface-adapter.md).

If you build your own chat UI, read the selected Session manually:

```ts
const state = await client.experimental.nexum.session.state({ sessionID })
const history = await client.experimental.nexum.session.messages({
  sessionID,
  limit: 50,
})

for await (const event of client.experimental.nexum.session.events(
  { sessionID },
  { afterSequence: state.lastSequence },
)) {
  console.log(event.type, event.data)
}
```

`state()` restores status, `messages()` restores chat history, and `events()`
receives live changes. See [Session capability](../capabilities/session.md) and
[ChatSurface parameters](../modules/nexum-chat-surface.md#parameters).

## Step 8: Understand one request's data flow

When the user sends “Summarize the project structure”, data flows like this:

```text
ChatSurface
  ↓ sessionID + text
Client
  ↓ HTTP POST /session/:id/prompt
Server
  ↓ invokes Runtime
Coding Loop
  ↓ reads role prompt, history, tools, and permissions
Model
  ↓ emits text or a tool call
Server
  ↓ SSE events
Client / ChatSurface
  ↓
User sees the result
```

- `sessionID` identifies which Session owns the task;
- `text` is the user's current Prompt;
- `rolePrompt` is the Runtime's default role;
- SQLite stores recoverable history and state;
- SSE sends the running process back to the frontend.

## What can you replace next?

After this tutorial, replace one boundary at a time:

- no persistence during an experiment: use [Memory Persistence](../modules/nexum-persistence-memory.md);
- JSON-file storage: use [File Persistence](../modules/nexum-persistence-file.md);
- another model provider: implement or inject [ModelPort](../modules/nexum-core.md#public-api);
- a different UI: keep [Protocol](../modules/nexum-protocol.md) and [Client](../modules/nexum-client.md), and replace Chat Surface;
- custom chat interaction: implement [ChatProtocolAdapter](../modules/nexum-surface-adapter.md#public-api).

## Common questions

### Why does the frontend not connect to the model directly?

Model credentials and host capabilities such as files and Shell belong on the
backend. The frontend connects to Nexum Server and consumes safe state and
events through Client and Protocol.

### Why is `directory` a backend path?

Agent tools execute in the backend Runtime, so `directory` must be a working
directory the backend can validate and access. It is not a browser-local path.

### I only want to verify the call chain. What should I do?

Start with [Embed an Agent](embedded-runtime.md). It needs no Server or
frontend; once the Runtime works, move to this SQLite + HTTP/SSE composition.

## Next references

- [Session capability](../capabilities/session.md)
- [Events and SSE](../capabilities/events.md)
- [Client API](../modules/nexum-client.md)
- [Chat Surface API](../modules/nexum-chat-surface.md)
- [Complete Runtime API](../../apis/nexum.md)
