# Context and History capability

[中文](../zh-CN/capabilities/context-and-history.md)

Nexum separates the durable message history from the context sent to the model.
The runtime can load project context, select relevant messages, compact an
over-sized context, and continue a Session from the compacted result.

## The three boundaries

| Data | Durable? | Purpose |
| --- | --- | --- |
| Message history | yes | Canonical user and assistant conversation |
| Runtime events | yes, according to Persistence policy | Replay, progress, and recovery |
| Context summary | yes | Recoverable result of compaction |

## Read and restore history

Use `session.messages()` for the visible conversation and `session.state()` for
the current status, pending Permission/Question requests, and event cursor.
Use `session.events()` to receive changes after the cursor. A UI should not
reconstruct history by concatenating event text.

```ts
const state = await client.experimental.nexum.session.state({ sessionID })
const history = await client.experimental.nexum.session.messages({
  sessionID,
  limit: 50,
})
```

Pagination uses `before`, `limit`, and (when returned) `snapshotID`. Keep the
snapshot ID with the page cursor when loading older messages.

## Compaction and safety

Compaction is a runtime operation, not a UI operation. The UI may show
`context.compaction.started/completed/failed`, but should continue to use the
canonical Session state and messages. Sensitive paths, credentials, and raw
command output must remain within the configured redaction boundary.

See [Session](session.md), [Events](events.md), and [Model / Runtime](model-runtime.md).

## What is included in context?

The model-visible request is assembled from the Runtime role prompt, project
context, selected Skills, canonical Session history, the current user task, and
the tools allowed by Permission policy. `rolePrompt` is Runtime-level
configuration; it is not a replacement for the user's `text`.

## History and snapshots

Use `session.messages({ sessionID, before, limit, snapshotID })` for paginated
history. A snapshot ID keeps a page stable while new events arrive. Render
canonical messages first and then apply newer events from the SSE cursor; do
not persist a second browser-only conversation.

## Compaction and recovery

Compaction is different from model retry. Retry handles a transient request
failure before visible output; compaction handles a context-window limit by
creating a recoverable summary:

```text
context.compaction.started
  → summary and retained messages are written
  → context.compaction.completed
  → the next model request continues from canonical history
```

If compaction fails, the Runtime publishes `context.compaction.failed` and the
Session remains recoverable according to its state. On restart, call `state()`
and `messages()` before resuming events.
