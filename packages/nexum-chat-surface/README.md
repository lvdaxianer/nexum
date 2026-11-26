# Nexum Chat Surface

Chat Surface 是可嵌入的 Solid 聊天组件和 Web Component，发布入口为 `nexum/chat-surface`，样式入口为 `nexum/chat-surface/styles.css`。

```bash
npm install nexum
```

```tsx
import { ChatSurface } from "nexum/chat-surface"
import "nexum/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.apiBaseUrl }} title="Nexum Chat" />
}
```

组件负责历史消息、实时事件、流式输出、Permission、Question、取消/继续和 Skill 展示；Session 创建、模型配置、权限策略和宿主能力仍由应用控制。它通过 `nexum/surface-adapter` 消费协议，不直接依赖 Core 或 Server。

也可注册 `<nexum-chat>` Web Component。组件使用 light DOM，宿主可以覆盖 `--nexum-chat-*` CSS 变量；需要完全不同的交互时，实现同一 `ChatProtocolAdapter` 即可替换 Surface。

仓库内开发：`bun test --cwd packages/nexum-chat-surface`、`bun run --cwd packages/nexum-chat-surface typecheck`。
