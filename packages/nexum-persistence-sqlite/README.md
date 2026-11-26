# Nexum SQLite Persistence

SQLite Persistence 是支持事务和重启恢复的数据库实现，发布入口为 `nexum/persistence/sqlite`。

```bash
npm install nexum
```

```ts
import { createSqlitePersistence } from "nexum/persistence/sqlite"
import { createSqliteRuntime } from "nexum/application"

const persistence = await createSqlitePersistence({ databasePath: ".nexum/nexum.db" })
const runtime = await createSqliteRuntime({ persistence })
```

首次打开数据库会初始化 schema；关闭后再次打开同一路径可以恢复已提交的 Session、消息、事件和交互状态。数据库及 WAL 文件应限制权限，测试必须为每个 Runtime 使用独立临时数据库，不能共享开发库。

仓库内开发：`bun test --cwd packages/nexum-persistence-sqlite`、`bun run --cwd packages/nexum-persistence-sqlite typecheck`。
