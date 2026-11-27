# UI interaction protocol

[中文](../zh-CN/ui/interaction-protocol.md)

Separate runtime-driven interactions from UI-local interactions. Runtime
interactions must be recoverable and addressed by protocol IDs; UI-local state
can remain in the Surface.

| Kind | Owner | UI responsibility | Recoverable |
| --- | --- | --- | --- |
| Runtime-driven | Core, Application, or a tool | Show a structured request and submit a decision | yes |
| UI-local | Surface | Manage open, selected, input, confirmation, loading, and error state | no |

## Runtime interaction flow

1. Read `session.state()` to discover pending Permission and Question requests.
2. Render each request with its `sessionID` and request ID.
3. Submit the decision through Client or Surface Adapter.
4. Observe the reply and subsequent events; do not infer success from the click alone.
5. On reconnect, reload state and deduplicate events by `eventID`.

## Display rules

Keep loading, empty, error, and disabled states explicit. Associate cards with
Session/request/tool IDs, preserve the original request while waiting, and do
not send a reply twice after a successful response. See [Permission](permission.md),
[Question](question.md), and [UI states](states.md).

## Runtime-driven interaction details

Permission and Question requests are facts owned by a Session. Discover them
from `state()` on first load and from matching events while connected. Keep the
request ID, Session ID, and tool call ID on the card; those identifiers are
required when sending a reply.

| Interaction | UI submits | After submission |
| --- | --- | --- |
| Permission | `requestID` + `allow_once`, `allow_always`, or `deny` | Wait for the reply/result event |
| Question | `requestID` + ordered string answers | Keep the card pending until the next event |
| Cancel | Session or request ID | Refresh state and show the terminal/cancelled result |

The UI must not decide that a click succeeded locally. It should observe the
protocol result, remove a stale card, and reload state when the Server reports a
missing, expired, or cross-Session request.

## Local UI interactions

Open panels, selected Session IDs, draft text, loading spinners, confirmations,
responsive layout, focus, and collapsed cards belong to the Surface. They do
not become Runtime events. Keep them separate so a refresh can recover the
Session without pretending to recover a browser-only draft.
