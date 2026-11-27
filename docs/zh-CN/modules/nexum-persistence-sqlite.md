# `nexum-ai/persistence/sqlite`

[English](../../modules/nexum-persistence-sqlite.md)

这是 `nexum-ai` 包中的 SQLite Persistence 变体。用户安装 `nexum-ai` 后从 `nexum-ai/persistence/sqlite` 导入 `createSqlitePersistence`。

```ts
import { createSqliteRuntime } from "nexum-ai/application"

const runtime = await createSqliteRuntime({ databasePath: ".nexum/nexum.db" })
```

## 公开 API

### `createSqlitePersistence(options)`

| 参数           | 类型     | 必填 | 说明                                                |
| -------------- | -------- | ---- | --------------------------------------------------- |
| `databasePath` | `string` | 否   | SQLite 数据库文件路径；省略时使用 `.nexum/nexum.db` |

返回完整的 `NexumPersistence` 组合，可传给 `createSqliteRuntime({ persistence })`。使用 `createSqliteRuntime` 时通常不需要直接创建 Persistence，它会根据 `databasePath` 完成组合和初始化。

SQLite 负责 schema 初始化、事务和重启恢复，适合 Web/Server 和真实持久化测试。测试必须使用独立临时数据库，数据库与 WAL 文件不能进入 release 包。

源码边界：`packages/nexum-persistence-sqlite/src/index.ts`。
