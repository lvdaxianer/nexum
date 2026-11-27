# `nexum-ai/persistence`

[中文](../zh-CN/modules/nexum-persistence.md)

Persistence provides Store and Event Hub implementations for the Core ports.
Import its contracts and low-level stores from `nexum-ai/persistence`.

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
uses memory stores. Use `nexum-ai/persistence/sqlite` for transactional SQLite
recovery. Persistence stores data and replay facts; it does not decide Skills,
Tools, Permissions, or runtime orchestration.

## What is persisted?

Concrete compositions can persist Sessions, messages, interactions, model
configuration, role prompts, Permission policy, Skill registrations, events,
and Memory. A local layout is conceptually:

```text
sessions.json          messages.json          interactions.json
model-config.json      role-prompt.json       skills.json
permission-policies.json  events.json         memory.json
```

`createLocalRuntime` chooses file stores under `.nexum`, while
`createEmbeddedRuntime` uses memory stores. Use `nexum-ai/persistence/sqlite` for
transactional SQLite recovery. The Application layer decides which stores to
compose; Server must not duplicate their read/write logic.

## Recovery boundary

Event Hub retains ordered facts and supports cursor-based replay. A restored
interaction can be marked orphaned when its original request is no longer
valid; an old request ID must not be answered after a restart. Persistence
provides the data needed for recovery, while Core decides runtime behavior.
