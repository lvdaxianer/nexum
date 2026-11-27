# Nexum module documentation

[中文](../zh-CN/modules/README.md)

Nexum publishes one package, `nexum`. The paths below are subpath imports from
that package. `@nexum/*` names describe source boundaries only; they are not
separate packages users should install.

## Public modules

| Module | Import | Guide |
| --- | --- | --- |
| Core | `nexum/core` | [Core](nexum-core.md) |
| Protocol | `nexum/protocol` | [Protocol](nexum-protocol.md) |
| Application | `nexum/application` | [Application](nexum-application.md) |
| Persistence contract | `nexum/persistence` | [Persistence](nexum-persistence.md) |
| Memory Persistence | `nexum/persistence/memory` | [Memory](nexum-persistence-memory.md) |
| File Persistence | `nexum/persistence/file` | [File](nexum-persistence-file.md) |
| SQLite Persistence | `nexum/persistence/sqlite` | [SQLite](nexum-persistence-sqlite.md) |
| Integrations | `nexum/integrations` | [Integrations](nexum-integrations.md) |
| Client | `nexum/client` | [Client](nexum-client.md) |
| Server | `nexum/server` | [Server](nexum-server.md) |
| Surface Adapter | `nexum/surface-adapter` | [Surface Adapter](nexum-surface-adapter.md) |
| Chat Surface | `nexum/chat-surface` | [Chat Surface](nexum-chat-surface.md) |
| CLI | `nexum` binary and `nexum/cli` | [CLI](nexum-cli.md) |

## Internal reference modules

These pages document repository-only validation surfaces. They are useful when
contributing, but are not public installation targets:

- [Reference Surfaces](nexum-surfaces.md)
- [Test Workbench](nexum-test.md)

Start with a [composition example](../examples/README.md) if you are unsure
which module to choose. Each page includes the import path, API parameters,
composition boundary, and links to the relevant capability or protocol guide.
