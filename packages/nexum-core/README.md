# Nexum Core

Core 是 UI 无关的运行语义层。源码 workspace 名称是 `@nexum/core`，发布入口是 `nexum-ai/core`，包含 Coding Loop、Session、Permission、Question、Context、Skill 以及 Model/Host/Memory Port。

```bash
npm install nexum-ai
```

```ts
import { createNexumCodingLoop, createNexumSessionService } from "nexum-ai/core"

const sessions = createNexumSessionService({ store, executionStore, directoryValidator })
const loop = createNexumCodingLoop({ model, sessions, tools, permission, context })
```

Core 只定义运行规则和端口，不直接选择数据库、HTTP 框架或 UI。通常由 `nexum-ai/application` 负责组装；需要完全自定义运行时，也可以自行实现 Port 后调用 Core 工厂。

主要边界包括模型流式输出、工具与 Host、Session 生命周期、权限决策、反问、上下文压缩、Skill 注册/调用和运行事件。Session 持久化 `plan | build` Agent 模式；Plan 模式只允许读取项目或写入相对路径 `.nexum/plans/`，Core 会在 PermissionPort 之前拒绝其他工具调用。所有工具执行都应经过宿主边界和 Permission；不要在 Surface 中复制 Coding Loop。

仓库内开发：`bun test --cwd packages/nexum-core`、`bun run --cwd packages/nexum-core typecheck`。
