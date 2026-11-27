# Nexum Client

Client 是基于标准 `fetch` 的 HTTP/SSE 协议客户端，发布入口为 `nexum-ai/client`。它只负责请求编码、Envelope 校验、稳定错误和 SSE 消费，不依赖 Core 或 Server 实现。

```bash
npm install nexum-ai
```

```ts
import { Nexum } from "nexum-ai/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
const capabilities = await client.capabilities()
```

Client 通常和 `nexum-ai/server` 配对，也可以被 Web、Desktop、TUI、CLI 或自定义应用直接使用。聊天交互建议再组合 `nexum-ai/surface-adapter`；Client 不创建 Runtime、不执行工具，也不保存服务端 Session。

运行约束：服务端地址和认证信息由宿主配置；SSE 消费应处理取消、断线和协议错误。

仓库内开发：`bun test --cwd packages/nexum-client`、`bun run --cwd packages/nexum-client typecheck`。
