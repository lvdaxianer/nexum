# Nexum Persistence

Persistence 是存储组合契约，发布入口为 `nexum-ai/persistence`。它定义 `NexumPersistence`、Store 组合和 Event Hub，不决定具体数据库或文件格式。

```bash
npm install nexum-ai
```

```ts
import type { NexumPersistence } from "nexum-ai/persistence"
import { createNexumEventHub } from "nexum-ai/persistence"

declare const persistence: NexumPersistence
const events = createNexumEventHub({ store: persistence.eventStore })
```

应用通常不直接创建契约层，而是选择 `nexum-ai/persistence/memory`、`nexum-ai/persistence/file` 或 `nexum-ai/persistence/sqlite` 后交给 `nexum-ai/application`。自定义存储实现必须保持 Core Store/Port 的一致性、错误边界和恢复语义。

运行约束：契约层本身不提供重启恢复；需要恢复时选择文件或 SQLite 实现，并把数据目录放在 release 之外。

仓库内开发：`bun test --cwd packages/nexum-persistence`、`bun run --cwd packages/nexum-persistence typecheck`。
