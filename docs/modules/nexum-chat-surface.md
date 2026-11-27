# `nexum/chat-surface`

[中文](../zh-CN/modules/nexum-chat-surface.md)

Chat Surface is an embeddable Solid UI. Import it from `nexum/chat-surface`.
It projects Session history, SSE events, streaming text, tools, Permission,
Questions, cancel/continue, and Skills into a chat component or Web Component.

## Public API

```tsx
import { ChatSurface } from "nexum/chat-surface"
import "nexum/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.apiBaseUrl }} />
}
```

The Web Component form is `<nexum-chat session-id="..." api-base-url="..." />`.

| Prop | Required | Meaning |
| --- | --- | --- |
| `sessionID` | yes | Existing Session to display and operate |
| `client` | no | Server URL and transport settings |
| `adapter` | no | Custom `ChatProtocolAdapter` |
| `title` | no | Panel title |

`sessionID` is reactive. When it changes, the component stops the old event
subscription, loads the new state and history, then resumes events from the
new cursor. The host chooses or creates Sessions; Chat Surface does not create
them. See [Session switching](../examples/full-stack-chat.md#switch-a-session-and-show-its-history).
