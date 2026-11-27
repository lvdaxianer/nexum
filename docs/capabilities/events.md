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
