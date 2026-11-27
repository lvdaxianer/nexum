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
