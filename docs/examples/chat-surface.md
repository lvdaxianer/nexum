# 案例：接入聊天 UI

## 适合谁

如果你已经有一个可访问的 Nexum Server，只想在 Web 应用中快速嵌入聊天界面，可以使用 Chat Surface。它会处理历史、流式事件、Permission、Question、取消和继续。

## 组合关系

```text
你的 Web 应用
  └─ nexum/chat-surface
       └─ nexum/surface-adapter
            └─ nexum/client
                 └─ nexum/protocol
```

涉及的公开模块：[Chat Surface](../modules/nexum-chat-surface.md)、[Surface Adapter](../modules/nexum-surface-adapter.md)、[Client](../modules/nexum-client.md) 和 [Protocol](../modules/nexum-protocol.md)。

## 完整示例

```tsx
import { ChatSurface } from "nexum/chat-surface"
import "nexum/chat-surface/styles.css"

export function AgentPanel(props: { sessionID: string; serverUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.serverUrl }} title="项目助手" />
}
```

Session 不由 Chat Surface 创建。宿主应用应该先通过 [Client Session API](../capabilities/session.md#session-api-查询) 创建或选择 Session，再把 `session.id` 传给组件。

## 参数说明

| 参数             | 类型                  | 说明                                           |
| ---------------- | --------------------- | ---------------------------------------------- |
| `sessionID`      | `string`              | 要展示的 Session；必须是 Server 中已存在的会话 |
| `client.baseUrl` | `string`              | Nexum Server 地址                              |
| `client.fetch`   | `NexumFetch`          | 可选的自定义请求实现                           |
| `title`          | `string`              | 聊天面板标题                                   |
| `adapter`        | `ChatProtocolAdapter` | 需要自定义传输或协议时替换默认适配器           |

## 什么时候自己实现 Surface

如果你需要完全不同的界面，不需要重写 Session、Permission 或事件逻辑。可以继续使用 [Protocol](../modules/nexum-protocol.md) 和 [Client](../modules/nexum-client.md)，或者只实现 [ChatProtocolAdapter](../modules/nexum-surface-adapter.md#公开-api)。

## 相关文档

- [UI 交互协议](../ui/interaction-protocol.md)
- [UI 状态与恢复](../ui/states.md)
- [事件与 SSE](../capabilities/events.md)
