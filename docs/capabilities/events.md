# Events and SSE capability

[中文](../zh-CN/capabilities/events.md)

Runtime events are ordered facts. Protocol wraps each event with an ID and a
Session sequence; Server delivers them through SSE; Client or a Surface folds
them into UI state.

## Event envelope

| Field | Meaning |
| --- | --- |
| `eventID` | Unique event ID and SSE `id` |
| `runID` | Run associated with the event |
| `type` | Protocol event type |
| `sessionID` | Session that owns the event |
| `sequence` | Increasing cursor within the Session |
| `occurredAt` | Event timestamp |
| `data` | Type-specific structured payload |

Common types are `assistant.thinking`, `assistant.reasoning`, `assistant.text`,
`tool.request`, `tool.result`, `permission.requested`, `question.request`,
`context.compaction.*`, `skill.activated`, `model.retry`, and
`session.completed/failed/cancelled`.

## Subscribe and resume

```ts
const state = await client.experimental.nexum.session.state({ sessionID })

for await (const event of client.experimental.nexum.session.events(
  { sessionID },
  { afterSequence: state.lastSequence },
)) {
  render(event)
}
```

On reconnect, send the last processed `sequence` as `afterSequence`. Deduplicate
by `eventID`, keep the Session ID in the subscription key, and do not merge
events from different Sessions.

## Persistence and terminal states

The persistence adapter records the facts required for replay and recovery.
Events may be retained or pruned according to the adapter policy; the client
must use the returned cursor rather than assuming a sequence starts at zero.
Terminal events stop the current run. A Session can still be queried or
continued according to its state.

See [Session](session.md), [UI states](../ui/states.md), and the
[Runtime API](../../apis/nexum.md).

## SSE connection and replay

The stream is opened at:

```text
GET /api/nexum/session/{sessionID}/events
```

The response is `text/event-stream; charset=utf-8` with no-store caching. A
client can resume with `Last-Event-ID`, `after`, or `afterSequence`. Store both
the event ID and sequence when possible. If a retained event is no longer
available, rebuild the projection from canonical history and the current
Session state instead of treating the missing middle event as a server failure.

## Projection rules

1. Deduplicate events by `eventID`.
2. Accept only a newer `sequence` for the selected Session; recover state when a
   gap is detected.
3. Append `assistant.text` and `assistant.reasoning` to the current message.
4. Associate `tool.request` and `tool.result` by `toolCallID`.
5. Create pending cards for Permission and Question requests and close them on
   the matching result or cancellation.
6. Treat `model.retry` as a retry indicator, not a new user message.
7. Use terminal events and `run.settled` to release the busy state.

Long-running input, event sequences, permission waits, Questions, compaction,
and terminal states are all observable and recoverable through this model.
