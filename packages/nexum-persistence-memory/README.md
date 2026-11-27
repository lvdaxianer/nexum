# Nexum Memory Persistence

Memory Persistence 是进程内存储实现，发布入口为 `nexum-ai/persistence/memory`。

```bash
npm install nexum-ai
```

```ts
import { createMemoryPersistence } from "nexum-ai/persistence/memory"
import { createEmbeddedRuntime } from "nexum-ai/application"

const persistence = createMemoryPersistence()
const runtime = createEmbeddedRuntime({ persistence })
```

每次创建组合都会得到独立状态，不创建文件或 SQLite 数据库，适合嵌入式运行、快速测试和一次性任务。它不提供进程重启恢复；需要恢复语义时改用 `nexum-ai/persistence/file` 或 `nexum-ai/persistence/sqlite`。

仓库内开发：`bun test --cwd packages/nexum-persistence-memory`、`bun run --cwd packages/nexum-persistence-memory typecheck`。
