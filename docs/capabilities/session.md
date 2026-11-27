# Session capability

[中文](../zh-CN/capabilities/session.md)

A Session is a durable, recoverable Agent task. It has a stable ID, a working
directory, a display name, lifecycle status, message history, pending
interactions, and an event cursor. The browser or UI should store the ID and
ask the Server for data; it should not read the Persistence database directly.

## Minimal flow

```ts
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "My Agent",
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
| `delete(input)` | `sessionID` | `{ id, deleted: true }` | Delete the Session and its history |
| `prompt(input)` | `sessionID`, `text` | accepted result | Queue new user input |
| `continue(input)` | `sessionID` | accepted result | Continue recoverable work |
| `cancel(input)` | `sessionID` | cancelled result | Cancel a run and pending interaction |
| `events(input, options)` | `sessionID`; optional `afterSequence`, `signal` | `AsyncIterable<NexumEvent>` | Stream and resume events |

The important parameters are `sessionID` (the ID returned by `create` or
`list`), `directory` (an absolute path on the Server host), `name` (a user-facing
label), `text` (the current task), `limit` (history page size), and
`afterSequence` (the last event already processed by the client).

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
