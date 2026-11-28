# Nexum Chat Surface

Chat Surface 是可嵌入的 Solid 聊天组件和 Web Component，发布入口为 `nexum-ai/chat-surface`，样式入口为 `nexum-ai/chat-surface/styles.css`。

```bash
npm install nexum-ai
```

```tsx
import { ChatSurface } from "nexum-ai/chat-surface"
import "nexum-ai/chat-surface/styles.css"

export function ChatPanel(props: { sessionID: string; apiBaseUrl: string }) {
  return <ChatSurface sessionID={props.sessionID} client={{ baseUrl: props.apiBaseUrl }} theme="light" title="Nexum Chat" showHeader={false} />
}
```

`theme` 可选值为 `"light"` 或 `"dark"`。传入后只固定 ChatSurface 自身的主题，不跟随宿主页面或系统深色模式；不传时使用默认亮色主题。

`showHeader` 默认值为 `true`。宿主不需要组件自带的标题栏时传入 `showHeader={false}`；这只隐藏顶部标题栏，不会隐藏消息、输入框或底部操作。

组件负责历史消息、实时事件、流式输出、Permission、Question、取消/继续和 Skill 展示；Session 创建、模型配置、权限策略和宿主能力仍由应用控制。它通过 `nexum-ai/surface-adapter` 消费协议，不直接依赖 Core 或 Server。

聊天输入区支持一次选择一个 `.md` 或 `.txt` 文件。文件只在浏览器本地读取，单文件限制为 512 KiB；发送时，文件名和全文会附加到当前 Prompt，并明确标记为已读取的本地文件正文，模型不需要按文件名访问工作目录。服务端历史保存完整 Prompt，回显时只展示用户问题和附件摘要；文件读取或发送失败时会保留输入和附件，发送成功后才清理附件；组件不会上传本地路径或新增文件接口。

也可注册 `<nexum-chat>` Web Component。组件使用 light DOM，宿主可以覆盖 `--nexum-chat-*` CSS 变量；需要完全不同的交互时，实现同一 `ChatProtocolAdapter` 即可替换 Surface。

```html
<nexum-chat session-id="session01" api-base-url="/api" title="Nexum Chat" show-header="false"></nexum-chat>
```

组件使用根节点 Container Query 适配嵌入尺寸。宽容器下输入操作保持紧凑排列；窄容器下快捷提示和模型信息位于第一行，上传、宿主扩展和发送等操作位于第二行，操作空间不足时继续换行，不依赖横向裁切。

仓库内开发：`bun test --cwd packages/nexum-chat-surface`、`bun run --cwd packages/nexum-chat-surface typecheck`。
