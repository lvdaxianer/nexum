# Permission protocol

[中文](../zh-CN/ui/permission.md)

Permission requests ask the user whether a tool action may run. The decision
belongs to the user or an explicit policy, not to the Surface component.

## Request fields

| Field | Meaning |
| --- | --- |
| `id` | Permission request ID |
| `sessionID` | Owning Session |
| `action` | Tool action such as `shell`, `read`, or `write` |
| `resource` | Resource or command, already redacted by the Server boundary |
| `reason` | Optional user-facing reason |

## Decisions

| Decision | Effect |
| --- | --- |
| `allow_once` | Allow this tool request without creating a permanent rule |
| `allow_always` | Allow and persist an exact matching rule |
| `deny` | Reject the request and let Runtime follow the error path |

The UI discovers pending items from `session.state()` or the matching event,
then replies with the Session ID, request ID, and decision. A stale, missing, or
cross-Session request must be removed and state refreshed rather than retried.

Policy management is exposed through the Runtime API. See [interaction
protocol](interaction-protocol.md), [events](../capabilities/events.md), and
[Runtime API](../../apis/nexum.md).

## HTTP operations

| Operation | Path | Purpose |
| --- | --- | --- |
| List | `GET /api/nexum/session/{sessionID}/permission` | Read pending requests |
| Reply | `POST /api/nexum/session/{sessionID}/permission/{requestID}/reply` | Submit a decision |
| List policy | `GET /api/nexum/permission/policy` | Read policy rules |
| Create/update/delete policy | `POST`, `PUT`, `DELETE` under `/api/nexum/permission/policy` | Manage reusable rules |

The reply must contain the request ID, selected decision, and owning Session.
`allow_once` affects one request; `allow_always` persists an exact matching
rule; `deny` rejects the operation. A stale or cross-Session request is a
protocol error: remove the card, refresh state, and do not retry the old ID.

## Persistence and restart

Pending Permission requests may be restored by File or SQLite Persistence. A
request that can no longer be resumed is exposed as stale/orphaned and must not
be answered by the UI. Policy data is persisted separately from the Core
decision logic.
