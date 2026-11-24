# @nexum/chat-surface

`ChatSurface` 是一个完整、可嵌入的 Nexum 聊天组件。宿主只需要提供 `sessionID` 和协议客户端配置；组件负责历史消息、实时事件、流式输出、权限请求、Question、取消/继续运行以及 `@skill` 补全和激活状态。

协议只有一种，UI 是协议的消费者。`ChatProtocolAdapter` 是组件与协议之间的稳定边界，默认适配器直接使用 `@nexum/client`，也可以注入自定义适配器对接同一套协议。

## Solid 用法

```tsx
import { ChatSurface } from "@nexum/chat-surface"
import "@nexum/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return (
    <ChatSurface
      sessionID={props.sessionID}
      client={{ baseUrl: props.apiBaseUrl }}
      title="Nexum Chat"
    />
  )
}
```

`sessionID` 可以是响应式值。Session 的创建、切换、模型配置、角色 Prompt、Skill 注册和宿主级权限策略仍由宿主控制；组件接管指定 Session 的聊天过程和交互反馈。

## Web Component 用法

组件使用 light DOM，不创建 Shadow DOM，适合直接嵌入独立页面、抽屉或弹框：

```html
<link rel="stylesheet" href="/node_modules/@nexum/chat-surface/styles.css" />
<script type="module">
  import "@nexum/chat-surface"
</script>

<dialog open>
  <nexum-chat
    session-id="session-id"
    api-base-url="http://127.0.0.1:4097"
    title="Nexum Chat"
  ></nexum-chat>
</dialog>
```

也可以通过 `adapter` 属性注入自定义 `ChatProtocolAdapter`：

```ts
import { createChatProtocolAdapter } from "@nexum/chat-surface"

const element = document.querySelector("nexum-chat")
element.adapter = createChatProtocolAdapter({ baseUrl: "http://127.0.0.1:4097" })
element.setAttribute("session-id", sessionID)
```

属性：

- `session-id`：要显示的 Session ID。
- `api-base-url`：默认协议适配器的 API 根地址；不设置时使用客户端默认地址。
- `title`：组件标题。

组件注册后会派发 `nexum-chat-ready` 事件，事件 `detail.sessionID` 包含当前 Session ID。

## 适配器能力

自定义适配器需要实现以下能力：加载历史消息和状态、订阅事件、列出 Skills、发送消息、回复权限、回复 Question、取消 Question、取消运行和继续运行。组件不会直接依赖宿主的 Session store，也不会自行创建 Session。

## 独立示例

查看 [`example/index.html`](./example/index.html)。示例展示了把完整聊天组件放进一个独立页面和 `<dialog>` 弹框，并通过 `session-id` 与 `api-base-url` 连接协议服务。
