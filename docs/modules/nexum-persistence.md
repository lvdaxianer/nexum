# `nexum/persistence`

[中文](../zh-CN/modules/nexum-persistence.md)

Persistence provides Store and Event Hub implementations for the Core ports.
Import its contracts and low-level stores from `nexum/persistence`.

## Public API

| API | Input | Returns | Use |
| --- | --- | --- | --- |
| `createInMemorySessionStore()` | none | `SessionStore` | Process-local Sessions |
| `createFileSessionStore(options)` | `filePath` | `SessionStore` | JSON-backed Sessions |
| `createInMemoryMessageStore()` | none | `MessageStore` | Process-local messages |
| `createFileMessageStore(options)` | `filePath` | `MessageStore` | JSON-backed history |
| `createNexumEventHub(options?)` | optional path and retention settings | `NexumEventHub` | Publish, subscribe, and replay events |
| `createInMemoryMemory(options?)` | optional Memory settings | `MemoryPort` | Process-local Memory |

`createLocalRuntime` composes file stores under `.nexum`; `createEmbeddedRuntime`
uses memory stores. Use `nexum/persistence/sqlite` for transactional SQLite
recovery. Persistence stores data and replay facts; it does not decide Skills,
Tools, Permissions, or runtime orchestration.
