# `nexum/persistence/memory`

这是 `nexum` 包中的进程内 Persistence 变体。用户安装 `nexum` 后从 `nexum/persistence/memory` 导入 `createMemoryPersistence`，不需要安装任何 `@nexum/*` 包。

```ts
import { createEmbeddedRuntime } from "nexum/application"
import { createMemoryPersistence } from "nexum/persistence/memory"

const runtime = createEmbeddedRuntime({ persistence: createMemoryPersistence() })
```

它不创建文件或数据库，每次创建组合都是独立状态，适合嵌入式运行和快速测试；进程重启后不会恢复。需要恢复语义时使用 `nexum/persistence/file` 或 `nexum/persistence/sqlite`。

源码边界：`packages/nexum-persistence-memory/src/index.ts`；仓库验证：`bun test --cwd packages/nexum-persistence-memory`。
