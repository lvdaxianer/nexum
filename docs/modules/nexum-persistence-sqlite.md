# `nexum-ai/persistence/sqlite`

[中文](../zh-CN/modules/nexum-persistence-sqlite.md)

SQLite Persistence stores runtime state transactionally and is the recommended
choice for a Server or any application that must recover after restart.

## Public API

```ts
import { createSqlitePersistence } from "nexum-ai/persistence/sqlite"

const persistence = await createSqlitePersistence({
  databasePath: ".nexum-ai/nexum.db",
})
```

| Option | Type | Required | Meaning |
| --- | --- | --- | --- |
| `databasePath` | `string` | no | SQLite file; defaults to `.nexum-ai/nexum.db` |

The database contains Session, message, event, interaction, and runtime state.
Use `createSqliteRuntime` for the normal Application-level composition; use this
module directly when replacing one Persistence boundary.
