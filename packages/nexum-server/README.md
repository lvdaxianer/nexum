# Nexum Server

Server 把已组合的 Runtime 暴露为 HTTP/SSE 服务，发布入口为 `nexum-ai/server`。

```bash
npm install nexum-ai
```

```ts
import { createSqliteRuntime } from "nexum-ai/application"
import { startNexumServer } from "nexum-ai/server"

const runtime = await createSqliteRuntime({ databasePath: ".nexum-ai/nexum.db" })
const server = await startNexumServer({ runtime, port: 4097 })
console.log(server.url)
```

Server 负责路由、JSON Envelope、错误边界、SSE 事件投递和 Session 控制面；运行语义由注入的 Application/Core 决定。客户端使用 `nexum-ai/client`，UI 使用 `nexum-ai/surface-adapter` 或其他 Surface。

运行约束：生产环境应把数据库和凭据目录放在 release 目录之外，并配置认证、CORS、Host 和 Permission 策略。Server 不应等待动态插件加载后才响应。

仓库内开发：`bun run --cwd packages/nexum-server dev`、`bun test --cwd packages/nexum-server`、`bun run --cwd packages/nexum-server typecheck`。
