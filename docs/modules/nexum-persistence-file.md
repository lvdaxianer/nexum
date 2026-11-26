# `nexum/persistence/file`

这是 `nexum` 包中的 JSON 文件 Persistence 变体。用户安装 `nexum` 后从 `nexum/persistence/file` 导入 `createFilePersistence`。

```ts
import { createLocalRuntime } from "nexum/application"
import { createFilePersistence } from "nexum/persistence/file"

const runtime = createLocalRuntime({ persistence: createFilePersistence({ dataDirectory: ".nexum" }) })
```

它按文件保存 Session、消息、事件、交互和配置，适合本地 CLI 或单机应用；生产环境需要把数据目录放在发布目录之外并单独备份。它不会自动迁移到 SQLite。

源码边界：`packages/nexum-persistence-file/src/index.ts`；仓库验证：`bun test --cwd packages/nexum-persistence-file`。
