# `@nexum/chat-surface`

状态：现状基线

权威来源：[`packages/nexum-chat-surface/src/index.ts`](../../packages/nexum-chat-surface/src/index.ts)、[`packages/nexum-chat-surface/README.md`](../../packages/nexum-chat-surface/README.md)

最后核对：2026-11-24

## 职责

`@nexum/chat-surface` 是可嵌入的 Chat UI。它把 Nexum Session 历史、SSE 事件、流式文本、Permission、Question、取消/继续和 `@skill` 交互投影成 Solid 组件或 Web Component。

宿主只需要提供 `sessionID` 和协议客户端配置。组件不拥有 Session 业务规则、权限策略或工具执行逻辑；这些由 Server/Application/Core 负责。

## 公开入口与接入

入口 [`src/index.ts`](../../packages/nexum-chat-surface/src/index.ts) 导出：

- `ChatSurface`、`ChatSurfaceProps`、`ChatItem`。
- `createChatProtocolAdapter`、`ChatProtocolAdapter`、`ChatProtocolError`。
- `CHAT_PROTOCOL_METHODS`、`ChatProtocolMethod` 及请求/标识类型。
- `CHAT_SURFACE_TAG`、`defineChatSurfaceElement`。
- Permission、Question、Skill 和事件类型。

Solid 接入：

```tsx
import { ChatSurface } from "@nexum/chat-surface"
import "@nexum/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.apiBaseUrl }} title="Nexum Chat" />
}
```

Web Component 接入：

```html
<nexum-chat session-id="session-id" api-base-url="http://127.0.0.1:4097" title="Nexum Chat"></nexum-chat>
```

组件使用 Light DOM，不使用 Shadow DOM。自定义元素准备完成后触发 `nexum-chat-ready`，事件 detail 包含 `sessionID`。

## 协议适配边界

`ChatProtocolAdapter` 是 UI 与传输之间的稳定边界。默认适配器使用 `@nexum/client`；宿主也可以注入自定义适配器。适配器必须覆盖：

`loadHistory`、`loadState`、`subscribeEvents`、`listSkills`、`sendMessage`、`replyPermission`、`replyQuestion`、`cancelQuestion`、`cancelRun`、`continueRun`。

组件以 `eventID` 去重，通过请求/工具 ID 归并交互卡片，并把 SSE 投影为可渲染的 ChatItem。事件顺序、终态和恢复语义见 [`docs/capabilities/events.md`](../capabilities/events.md)；Question/Permission 行为见 [`docs/ui/question.md`](../ui/question.md) 和 [`docs/ui/permission.md`](../ui/permission.md)。

## 依赖边界

该包依赖 Client、Protocol、Solid、DOMPurify 和 marked。它可以消费协议类型，但不能依赖 Core、Application 或 Server 内部模块。宿主通过 `@nexum/client` 或自定义 `ChatProtocolAdapter` 接入。

## 测试与验证

```sh
cd packages/nexum-chat-surface
bun test
bun run typecheck
```

投影和默认适配器测试位于 [`packages/nexum-chat-surface/test/chat-projection.test.ts`](../../packages/nexum-chat-surface/test/chat-projection.test.ts) 与 [`packages/nexum-chat-surface/test/default-adapter.test.ts`](../../packages/nexum-chat-surface/test/default-adapter.test.ts)。可运行 [`packages/nexum-chat-surface/example/index.html`](../../packages/nexum-chat-surface/example/index.html) 检查宿主接入。

## 修改同步清单

- 修改 ChatProtocol 方法：同步 [`apis/nexum.md`](../../apis/nexum.md)、[`@nexum/client`](./nexum-client.md) 和默认适配器测试。
- 修改事件投影或去重：同步 [`docs/capabilities/events.md`](../capabilities/events.md)、[`docs/ui/states.md`](../ui/states.md) 和投影测试。
- 修改 Permission/Question 控件：同步 [`docs/ui/permission.md`](../ui/permission.md)、[`docs/ui/question.md`](../ui/question.md) 和交互协议文档。
