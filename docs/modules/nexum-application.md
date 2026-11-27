# `nexum/application`

[中文](../zh-CN/modules/nexum-application.md)

Import from the one published package: `nexum/application`.

## Responsibility

Application is Nexum's Runtime Composer. It combines Core ports, Persistence
stores, and Integration adapters into a runnable Runtime with Session, Coding
Loop, Skill, Tool, Question, Permission, and Event services. It is not an HTTP
API and does not render UI.

## Public API

```ts
import { createLocalRuntime } from "nexum/application"

const runtime = createLocalRuntime({ dataDirectory: ".nexum" })
const session = await runtime.sessionService.create({ directory: process.cwd() })
await runtime.close()
```

| API | Use |
| --- | --- |
| `createEmbeddedRuntime(options?)` | In-memory runtime, embedding, and short-lived tasks |
| `createLocalRuntime(options?)` | File-backed local runtime and restart recovery |
| `createSqliteRuntime(options?)` | SQLite transactions and durable recovery |
| `createDefaultRuntime` | Alias for the local default runtime |
| `createNexumQuestionPort`, `createNexumSkillRegistry`, `createNexumToolRegistry` | Compose application services |

### Common options

| Option | Meaning |
| --- | --- |
| `model` | Inject a custom `ModelPort` |
| `modelConfig` | Store and load model configuration |
| `rolePrompt` | Runtime-level system instruction |
| `rolePromptFile` | File used to store the role prompt |
| `dataDirectory` | File Persistence directory |
| `databasePath` | SQLite database path |
| `host`, `sandbox` | File/Shell capabilities and safety boundary |
| `skillRoots` | Skill discovery directories |
| `mcp` | Inject an MCP port |
| `persistence` | Replace the complete default storage composition |

The most common members are `sessionService`, `codingLoop`, `rolePrompt`,
`permissionBroker`, `questionPort`, `eventHub`, and `messageStore`. See the
[Session guide](../capabilities/session.md) for the next call after creating a
Runtime.
