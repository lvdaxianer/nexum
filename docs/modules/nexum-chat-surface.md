# `nexum-ai/chat-surface`

[中文](../zh-CN/modules/nexum-chat-surface.md)

Chat Surface is an embeddable Solid UI. Import it from `nexum-ai/chat-surface`.
It projects Session history, SSE events, streaming text, tools, Permission,
Questions, cancel/continue, and Skills into a chat component or Web Component.

## Public API

```tsx
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.apiBaseUrl }} theme="light" />
}
```

`theme` 可选值为 `"light"` 或 `"dark"`。显式传入后，组件只使用自身固定主题，不受宿主 `html[data-theme]` 或系统深色模式影响；不传时使用默认亮色主题。

The Web Component form is `<nexum-chat session-id="..." api-base-url="..." />`.

## Parameters

| Prop | Required | Meaning |
| --- | --- | --- |
| `sessionID` | yes | Existing Session to display and operate |
| `client` | no | Server URL and transport settings |
| `adapter` | no | Custom `ChatProtocolAdapter` |
| `title` | no | Panel title |
| `theme` | no | Forced `"light"` or `"dark"` theme for the component only |

`sessionID` is reactive. When it changes, the component stops the old event
subscription, loads the new state and history, then resumes events from the
new cursor. The host chooses or creates Sessions; Chat Surface does not create
them. See [Session switching](../examples/full-stack-chat.md#step-7-switch-a-session-and-show-its-history).

## Solid and Web Component forms

The component is also available as a Light DOM custom element:

```html
<nexum-chat session-id="session-id" api-base-url="http://127.0.0.1:4097" title="Nexum Chat"></nexum-chat>
```

The public entry exports `ChatSurface`, its props and item types, the
`ChatProtocolAdapter` compatibility exports, protocol method constants, and
`defineChatSurfaceElement`. The custom element dispatches
`nexum-chat-ready` with the current `sessionID` in its detail.

## Adapter boundary

The default adapter uses Client. A host can inject another adapter when the
transport is not HTTP/SSE, but it must provide `loadHistory`, `loadState`,
`subscribeEvents`, `listSkills`, `sendMessage`, `replyPermission`,
`replyQuestion`, `cancelQuestion`, `cancelRun`, and `continueRun`.
Chat Surface deduplicates by `eventID` and associates cards by request and tool
IDs; it does not implement Core execution or policy decisions.
