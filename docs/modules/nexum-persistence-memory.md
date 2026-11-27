# `nexum/persistence/memory`

[中文](../zh-CN/modules/nexum-persistence-memory.md)

Memory Persistence is useful for embedded runtimes and fast tests. It creates
no file or database and each composition starts with independent state.

## Public API

```ts
import { createMemoryPersistence } from "nexum/persistence/memory"

const persistence = createMemoryPersistence()
```

`createMemoryPersistence()` returns the complete in-memory Persistence
composition. Data is lost when the process closes. Use [File Persistence](nexum-persistence-file.md)
or [SQLite Persistence](nexum-persistence-sqlite.md) when recovery is required.
