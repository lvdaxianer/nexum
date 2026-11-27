# Nexum Surface Adapter

Surface Adapter 是 UI 与协议之间的稳定边界，发布入口为 `nexum-ai/surface-adapter`。它提供 `ChatProtocolAdapter`、聊天操作和协议错误归一化。

```bash
npm install nexum-ai
```

```ts
import { createChatProtocolAdapter } from "nexum-ai/surface-adapter"

const adapter = createChatProtocolAdapter({ baseUrl: "http://127.0.0.1:4097" })
const history = await adapter.loadHistory({ sessionID })
```

Chat Surface、CLI、Web 或自定义 UI 可以复用同一 Adapter，不需要知道 Core 的 Store 和执行细节。更换传输或测试宿主时可以注入自定义 `ChatProtocolAdapter`，但应保留 Session、Permission、Question、取消和继续操作语义。

仓库内开发：`bun test --cwd packages/nexum-surface-adapter`、`bun run --cwd packages/nexum-surface-adapter typecheck`。
