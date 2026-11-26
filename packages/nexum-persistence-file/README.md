# Nexum File Persistence

File Persistence 是本地 JSON 文件存储实现，发布入口为 `nexum/persistence/file`。

```bash
npm install nexum
```

```ts
import { createFilePersistence } from "nexum/persistence/file"
import { createLocalRuntime } from "nexum/application"

const persistence = createFilePersistence({ dataDirectory: ".nexum" })
const runtime = createLocalRuntime({ persistence })
```

Session、消息、事件、Permission、Memory、Skill 和 MCP 状态保存在同一数据目录下的独立文件中，支持原子写入和逐文件覆盖，适合本地 CLI 或单机应用。它不会自动把历史 JSON 迁移到 SQLite；生产部署要单独备份数据目录并限制权限。

仓库内开发：`bun test --cwd packages/nexum-persistence-file`、`bun run --cwd packages/nexum-persistence-file typecheck`。
