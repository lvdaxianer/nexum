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
- `theme`：主题，`dark` 启用内置深色主题；不设置时为默认亮色。

组件注册后会派发 `nexum-chat-ready` 事件，事件 `detail.sessionID` 包含当前 Session ID。

## 主题与外观

组件样式完全由 `--nexum-chat-*` CSS 自定义属性驱动（颜色、圆角、字阶、触控目标），宿主可以逐项覆盖实现换肤。`ChatSurface` 的 `theme` prop 或 Web Component 的 `theme` 属性设置为 `dark` 时启用内置深色主题。内部断点基于组件自身容器宽度（container query），并针对触屏放大交互目标；嵌入窄抽屉、弹框或手机布局时无需额外处理。

## 权限设置入口

组件不管理权限策略，但提供两个可选的扩展点，把宿主自己的权限设置 UI 接到聊天现场：

- `composerExtras`（Solid 渲染插槽）：渲染在输入栏发送键左侧，适合放权限模式 chip；Web Component 中用 `[slot="composer-extras"]` 子节点注入。
- `onOpenPermissionSettings`（Solid 回调）：权限请求条上的「权限设置」触发时调用；Web Component 中组件根节点派发 `permission-settings` CustomEvent。

两者都不提供时，入口不渲染，聊天行为不变。

## 适配器能力

自定义适配器需要实现以下能力：加载历史消息和状态、订阅事件、列出 Skills、发送消息、回复权限、回复 Question、取消 Question、取消运行和继续运行。组件不会直接依赖宿主的 Session store，也不会自行创建 Session。

## 独立示例

查看 [`example/index.html`](./example/index.html)。示例展示了把完整聊天组件放进一个独立页面和 `<dialog>` 弹框，并通过 `session-id` 与 `api-base-url` 连接协议服务。
