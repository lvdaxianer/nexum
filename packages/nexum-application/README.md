# Nexum Application

Application 是 Nexum 的 Runtime Composer。源码 workspace 名称是 `@nexum/application`，发布后通过 `nexum/application` 使用；用户只需要安装一个 `nexum` 包。

```bash
npm install nexum
```

```ts
import { createEmbeddedRuntime } from "nexum/application"
import type { ModelPort } from "nexum/core"

declare const model: ModelPort
const runtime = createEmbeddedRuntime({ model })
const session = await runtime.sessionService.create({ directory: process.cwd(), name: "demo" })
await runtime.codingLoop.run({ sessionID: session.sessionID, text: "检查当前项目" })
```

它把 Core、Persistence 和 Integrations 组合成可运行 Runtime。快速嵌入使用 `createEmbeddedRuntime`，本地文件运行使用 `createLocalRuntime`，SQLite/服务端恢复使用 `createSqliteRuntime`；也可以通过 `NexumRuntimeOptions` 注入自己的 Model、Host、Permission 或 Store。

Application 不负责 UI 和 HTTP 传输。需要服务端时再组合 `nexum/server`，需要客户端时组合 `nexum/client`；持久化实现见 `nexum/persistence/memory`、`nexum/persistence/file` 和 `nexum/persistence/sqlite`。

运行约束：`model`、工作目录和敏感能力由宿主提供；生产服务应使用可恢复的文件或 SQLite Persistence，不要把内存状态当作重启恢复方案。

仓库内开发：`bun test --cwd packages/nexum-application`、`bun run --cwd packages/nexum-application typecheck`。
