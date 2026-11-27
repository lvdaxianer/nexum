# Example: Add a Chat Surface

[中文](../zh-CN/examples/chat-surface.md)

## When to use this

Use Chat Surface when you already have a Nexum Server and want a ready-made
chat interface. The host application chooses or creates a Session and passes
its ID to the component.

## Composition

```text
Your application
  └─ nexum-ai/chat-surface
       └─ nexum-ai/surface-adapter
            └─ nexum-ai/client
                 └─ HTTP/SSE Server
```

## Install and render

```bash
npm install nexum-ai
```

```tsx
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"

export function AgentPanel(props: { sessionID: string; serverUrl: string }) {
  return (
    <ChatSurface
      sessionID={props.sessionID}
      client={{ baseUrl: props.serverUrl }}
      title="Project assistant"
    />
  )
}
```

The component loads history and state, subscribes to SSE, renders streaming
text and tool calls, and handles Permission, Question, cancel, and continue
interactions. It does not create a Session by itself.

## Parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `sessionID` | yes | Existing Session to display and operate |
| `client.baseUrl` | no | Nexum Server URL |
| `client.fetch` | no | Custom request implementation |
| `title` | no | Panel title |
| `adapter` | no | Custom `ChatProtocolAdapter` |

To switch Sessions, update the `sessionID` prop. Chat Surface stops the old
subscription, loads the new history/state, and resumes events from the correct
sequence. See [Session switching](full-stack-chat.md#step-7-switch-a-session-and-show-its-history).

## Build your own UI

Keep using [Client](../modules/nexum-client.md) and [Protocol](../modules/nexum-protocol.md),
or implement only the [Surface Adapter](../modules/nexum-surface-adapter.md).
You do not need to reimplement the Coding Loop.

## Related references

- [UI interaction protocol](../ui/interaction-protocol.md)
- [UI states and recovery](../ui/states.md)
- [Events and SSE](../capabilities/events.md)
