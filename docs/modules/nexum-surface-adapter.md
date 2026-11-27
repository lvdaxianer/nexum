# `nexum/surface-adapter`

[中文](../zh-CN/modules/nexum-surface-adapter.md)

Surface Adapter is the stable boundary between a chat UI and Nexum transport.
Import it from `nexum/surface-adapter`.

## Public API

```ts
import { createChatProtocolAdapter } from "nexum/surface-adapter"

const adapter = createChatProtocolAdapter({ baseUrl: "http://127.0.0.1:4097" })
const state = await adapter.loadState(sessionID)
```

| Method | Input | Purpose |
| --- | --- | --- |
| `createChatProtocolAdapter(options)` | `baseUrl?`, `fetch?` | Create the default Client-backed adapter |
| `loadHistory(input)` | Session ID and paging | Load history |
| `loadState(sessionID)` | Session ID | Load recovery state |
| `subscribeEvents(input)` | Session ID, cursor, signal | Subscribe and resume events |
| `listSkills()` | none | List Skills for completion |
| `sendMessage(input)` | Session ID, text | Submit user input |
| `replyPermission(input)` | Session ID, request ID, decision | Reply to Permission |
| `replyQuestion(input)` | Session ID, request ID, answers | Reply to Question |
| `cancelQuestion`, `cancelRun`, `continueRun` | IDs | Control interaction or run |

The default adapter normalizes Client errors into `ChatProtocolError`. A host
can implement the same contract for another transport. It does not render UI,
own policy, or execute Core logic. See [Chat Surface](nexum-chat-surface.md).

## Method groups

| Group | Methods | Purpose |
| --- | --- | --- |
| Recovery | `loadHistory`, `loadState`, `subscribeEvents` | Load a Session and resume its event cursor |
| User input | `sendMessage` | Submit the current task text |
| Human interaction | `replyPermission`, `replyQuestion`, `cancelQuestion` | Answer or cancel pending requests |
| Run control | `cancelRun`, `continueRun` | Stop or resume a recoverable run |
| Discovery | `listSkills` | Provide Skill completion data |

The adapter is a transport boundary. It keeps Session IDs and event cursors
explicit, normalizes errors for a Surface, and leaves rendering and policy
decisions to the host.
