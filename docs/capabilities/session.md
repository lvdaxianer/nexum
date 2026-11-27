# Session capability

[中文](../zh-CN/capabilities/session.md)

A Session is a durable, recoverable Agent task. It has a stable ID, a working
directory, a display name, lifecycle status, message history, pending
interactions, and an event cursor. The browser or UI should store the ID and
ask the Server for data; it should not read the Persistence database directly.
Each Session also persists an Agent mode: `plan` for read-and-plan work or
`build` for normal execution. Existing Sessions default to `build`.

## Minimal flow

```ts
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "My Agent",
  mode: "plan",
})

await client.experimental.nexum.session.prompt({
  sessionID: session.id,
  text: "Summarize this project",
})
```

## Session API

All methods are under `client.experimental.nexum.session` in the current
protocol version.

| Method | Required input | Result | Use |
| --- | --- | --- | --- |
| `create(input)` | `directory`; optional `name` | `NexumSession` | Create a Session |
| `list()` | none | `NexumSession[]` | Load the Session picker |
| `state(input)` | `sessionID` | `NexumSessionState` | Restore status, pending interactions, and `lastSequence` |
| `messages(input)` | `sessionID`; optional `before`, `limit`, `snapshotID` | `NexumSessionMessages` | Page through history |
| `update(input)` | `sessionID`, `name` | `NexumSession` | Rename a Session |
| `setMode(input)` | `sessionID`, `mode` (`plan` or `build`) | `NexumSession` | Switch Agent mode when idle |
| `delete(input)` | `sessionID` | `{ id, deleted: true }` | Delete the Session and its history |
| `prompt(input)` | `sessionID`, `text` | accepted result | Queue new user input |
| `continue(input)` | `sessionID` | accepted result | Continue recoverable work |
| `cancel(input)` | `sessionID` | cancelled result | Cancel a run and pending interaction |
| `events(input, options)` | `sessionID`; optional `afterSequence`, `signal` | `AsyncIterable<NexumEvent>` | Stream and resume events |

The important parameters are `sessionID` (the ID returned by `create` or
`list`), `directory` (an absolute path on the Server host), `name` (a user-facing
label), `mode` (`plan` or `build`), `text` (the current task), `limit` (history page size), and
`afterSequence` (the last event already processed by the client).

Plan mode exposes read operations and allows writes only below
`.nexum/plans/`. Core rejects business-file writes, Shell, MCP, and Skill
management before permission evaluation. Build mode keeps the normal tool and
permission behavior. A running Session cannot switch mode; retry after it
reaches a terminal state or cancel the run first.

## List and switch Sessions

Load `list()` for a sidebar. When the user selects an item, update the selected
ID and pass it to Chat Surface:

```tsx
<ChatSurface sessionID={selectedSessionID()} client={{ baseUrl }} />
```

Chat Surface reloads `state` and `messages`, then subscribes to `events` from
the correct sequence. A custom UI should perform the same three operations.

## Recovery and lifecycle

Prompt input is admitted durably before execution. A restart can therefore
reload the Session, history, pending Permission/Question requests, and event
cursor. Use `state()` to decide whether `continue()` is available. Use
`cancel()` for an active run; use `delete()` only when the user explicitly
confirms removal.

## Related references

- [Complete Agent tutorial](../examples/full-stack-chat.md)
- [Events and SSE](events.md)
- [Client module](../modules/nexum-client.md)
- [Runtime API](../../apis/nexum.md)

## What each Session operation does

| Operation | What the UI normally does | Important input |
| --- | --- | --- |
| `create()` | Create a new item and select it | `directory`, optional `name` |
| `list()` | Fill the Session sidebar | no input |
| `state()` | Restore status, pending Permission/Question, and cursor | `sessionID` |
| `messages()` | Restore the conversation, usually page by page | `sessionID`, optional `before`, `limit`, `snapshotID` |
| `update()` | Rename the selected Session | `sessionID`, `name` |
| `setMode()` | Change Plan/Build behavior | `sessionID`, `mode` |
| `delete()` | Remove a Session after confirmation | `sessionID` |
| `prompt()` | Queue a new user task | `sessionID`, `text` |
| `continue()` | Resume recoverable work | `sessionID` |
| `cancel()` | Stop the active run or pending interaction | `sessionID` |
| `events()` | Receive and resume live events | `sessionID`, optional `afterSequence`, `signal` |

The API entry point is always `client.experimental.nexum.session`. The
browser stores the returned `id`; it never invents an ID or reads the SQLite
file. The `name` is only a display label. The `directory` is validated on the
Server host and is not a browser-local file path.

## Create, list, and switch

Create returns the Session snapshot and its stable `id`:

```ts
const created = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "Project assistant",
})
```

Load `list()` for a picker. When the user clicks another item, set the selected
ID, call `state()` and `messages()` for that ID, then start `events()` from
the returned `lastSequence`. Chat Surface performs those three reads when its
`sessionID` prop changes.

## Rename and delete

```ts
await client.experimental.nexum.session.update({
  sessionID,
  name: "Renamed assistant",
})

await client.experimental.nexum.session.delete({ sessionID })
```

After a rename, refresh the sidebar from `list()` or update the local snapshot.
After deletion, remove the selected ID and do not render Chat Surface with it.
Deletion is durable: it removes the Session's history and runtime records
according to the configured Persistence adapter. Ask for explicit user
confirmation before calling it.

## Persistence and restart recovery

With SQLite or File Persistence, creating a Session writes its durable record to
the backend store. Prompt admission, messages, events, pending interactions,
and runtime configuration are then available after a server restart. Memory
Persistence is process-local and intentionally loses this data when the
process closes.

The recovery sequence is:

1. call `state()` to obtain the current snapshot and `lastSequence`;
2. call `messages()` to restore canonical history;
3. subscribe with `events({ afterSequence: state.lastSequence })`;
4. deduplicate by `eventID` and keep actions scoped to the selected Session.

Do not decide whether a run completed by looking only at the last visible text;
use the Session state and terminal events.
