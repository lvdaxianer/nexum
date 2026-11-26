# Nexum Core

Core 是 UI 无关的运行语义层。源码 workspace 名称是 `@nexum/core`，发布入口是 `nexum/core`，包含 Coding Loop、Session、Permission、Question、Context、Skill 以及 Model/Host/Memory Port。

```bash
npm install nexum
```

```ts
import { createNexumCodingLoop, createNexumSessionService } from "nexum/core"

const sessions = createNexumSessionService({ store, executionStore, directoryValidator })
const loop = createNexumCodingLoop({ model, sessions, tools, permission, context })
```

Core 只定义运行规则和端口，不直接选择数据库、HTTP 框架或 UI。通常由 `nexum/application` 负责组装；需要完全自定义运行时，也可以自行实现 Port 后调用 Core 工厂。

主要边界包括模型流式输出、工具与 Host、Session 生命周期、权限决策、反问、上下文压缩、Skill 注册/调用和运行事件。所有工具执行都应经过宿主边界和 Permission；不要在 Surface 中复制 Coding Loop。

仓库内开发：`bun test --cwd packages/nexum-core`、`bun run --cwd packages/nexum-core typecheck`。
