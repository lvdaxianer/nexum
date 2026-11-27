# Nexum Runtime flow

[中文](../zh-CN/architecture/runtime-flow.md)

## Overall path

```text
User input → Client → Server → Session admission
           → Coding Loop → Model / Tool / Permission / Question
           → ordered events → SSE → Client / Surface projection
```

## Prompt to terminal state

1. Client submits `session.prompt({ sessionID, text })`.
2. Runtime records the durable admission before scheduling execution.
3. Coding Loop reloads the Session history and performs one model step.
4. Tool calls, Permission, Questions, retries, and text become ordered events.
5. Server streams events; the client updates the projection.
6. A completed, failed, or cancelled event releases the run boundary.

## Pause and recovery

Permission and Question requests pause execution until a matching decision is
submitted. Context compaction emits progress events and produces a recoverable
summary. On refresh or restart, load `state()`, `messages()`, and `events()`
from `lastSequence`; do not rebuild state from visible text.

## Cancellation and failure

Cancellation targets the active Session run and produces a terminal event.
Retryable model failures follow the configured retry policy. Transport clients
should normalize errors, refresh state when a request is stale, and keep
Session IDs and event cursors explicit. See [Session](../capabilities/session.md)
and [Events](../capabilities/events.md).

## A recoverable request

```text
Prompt admission
  → durable Session inbox fact
  → Session runner wakes
  → reload canonical history
  → one explicit model step
  → tool / Permission / Question boundary
  → ordered events and projection
  → terminal or recoverable state
```

The model step continues from reloaded history; the browser does not own an
in-memory tool loop. A restart resumes from durable facts and the Session
cursor. A different Surface can consume the same events without changing the
runtime semantics.
