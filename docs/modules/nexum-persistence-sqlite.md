# `nexum/persistence/sqlite`

这是 `nexum` 包中的 SQLite Persistence 变体。用户安装 `nexum` 后从 `nexum/persistence/sqlite` 导入 `createSqlitePersistence`。

```ts
import { createSqliteRuntime } from "nexum/application"

const runtime = await createSqliteRuntime({ databasePath: ".nexum/nexum.db" })
```

SQLite 负责 schema 初始化、事务和重启恢复，适合 Web/Server 和真实持久化测试。测试必须使用独立临时数据库，数据库与 WAL 文件不能进入 release 包。

源码边界：`packages/nexum-persistence-sqlite/src/index.ts`；仓库验证：`bun test --cwd packages/nexum-persistence-sqlite`。
