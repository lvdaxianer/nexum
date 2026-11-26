# Nexum Protocol

Protocol 是版本化的数据模型和事件契约，发布入口为 `nexum/protocol`。它定义 `nexum.runtime.v1`、JSON Envelope、能力发现、Session、Permission、Question、Skill、事件和 SSE 数据结构。

```bash
npm install nexum
```

```ts
import { NEXUM_API_PREFIX, NEXUM_PROTOCOL_VERSION, type NexumEvent } from "nexum/protocol"

console.log(NEXUM_PROTOCOL_VERSION, NEXUM_API_PREFIX)
function consume(event: NexumEvent) { /* 按事件类型更新 UI */ }
```

Protocol 不依赖 Core、Server 或具体 UI，适合实现其他语言客户端、传输绑定和自定义 Surface。请求响应使用 `data` 与 `meta.protocolVersion`，事件使用序列号和 Session 标识；消费方应按事件事实建投影，不要解析展示文本猜状态。

仓库内开发：`bun test --cwd packages/nexum-protocol`、`bun run --cwd packages/nexum-protocol typecheck`。
