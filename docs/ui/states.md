# UI states and operation reliability

[中文](../zh-CN/ui/states.md)

A Surface should derive its state from Session snapshots and ordered events.
Do not maintain a second hidden Coding Loop in the browser.

| State | Meaning | Typical actions |
| --- | --- | --- |
| `no session` | No Session ID was supplied | Choose a Session |
| `idle` | History is loaded and no run is active | Input, send, reconnect |
| `running` / `streaming` | Prompt accepted and events are arriving | Cancel |
| `retrying` | Model retry event received | Wait or cancel |
| `awaiting permission` | Permission request is pending | Allow once, always, or deny |
| `awaiting question` | Question request is pending | Select, submit, or cancel |
| `completed` | Run reached a normal terminal state | New Prompt |
| `failed` | Transport, model, or runtime failure | Retry, continue, or reconnect |
| `cancelled` | User or runtime cancelled the run | New Prompt |

## Switching and recovery

When a selected Session changes, unsubscribe from the old Session, load the new
`state()` and `messages()`, then subscribe to `events()` from its
`lastSequence`. On reconnect, deduplicate by `eventID` and keep actions scoped
to the active Session.

See [Session](../capabilities/session.md), [Events](../capabilities/events.md),
[Permission](permission.md), and [Question](question.md).

## Submit, cancel, and continue

### Prompt

Disable duplicate submission while the current request is being admitted, then
show the run from ordered events. A Prompt is durable before execution begins;
refreshing the page must not create a second task from the same user action.

### Question and Permission

Keep the card pending until the matching protocol response is observed. Disable
the reply control after submission and show an error/reload state if the request
is stale or belongs to another Session.

### Cancel and continue

`cancel()` targets the active Session run and should be followed by state
refresh. `continue()` is available only when `state().canContinue` says the
Session can recover. A cancelled or failed run is not automatically retried by
the browser.

## A reliable initialization sequence

```text
selected session ID
  → state()
  → messages() with snapshot/page cursor
  → events({ afterSequence: state.lastSequence })
  → deduplicate by eventID
```

Use the same sequence after reconnect or Session switching, and always scope
actions and event subscriptions to the selected Session ID.
