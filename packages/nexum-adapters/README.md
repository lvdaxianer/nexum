# @nexum/adapters

默认适配器和 Runtime 组合器。它把 Core 端口装配成嵌入式或本地文件持久化运行时，同时保留替换 Model、Host、Memory、MCP、Store 和 Event 的边界。

```ts
import { createEmbeddedRuntime, createLocalRuntime } from "@nexum/adapters"

const embedded = createEmbeddedRuntime({ model })
const local = createLocalRuntime({ dataDirectory: ".nexum" })
```

- `createEmbeddedRuntime`：内存 Session、消息、事件和 Memory，适合测试、桌面嵌入与单进程应用。
- `createLocalRuntime`：`.nexum` 文件存储、事件回放、模型配置和权限策略，适合本地服务。
- `createLocalHostAdapter`：限制在 Session 工作目录内的文件和 Shell Host。
- `createNexumEventHub`：进程内事件订阅与可选 JSON 持久化。
