# `nexum/persistence/file`

[中文](../zh-CN/modules/nexum-persistence-file.md)

File Persistence stores Sessions, messages, events, interactions, and runtime
configuration in a local data directory. It is intended for local CLI and
single-machine applications.

## Public API

```ts
import { createFilePersistence } from "nexum/persistence/file"

const persistence = createFilePersistence({
  dataDirectory: ".nexum",
})
```

| Option | Type | Required | Meaning |
| --- | --- | --- | --- |
| `dataDirectory` | `string` | yes | Directory for runtime data files |

Keep the data directory outside the published source tree and back it up
separately. File Persistence does not automatically migrate its data to SQLite.
