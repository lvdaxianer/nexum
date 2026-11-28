# Nexum

[中文](README.zh-CN.md)

Nexum is a UI-agnostic, protocol-first, composable Agent Runtime. It separates
runtime semantics, environment adapters, application composition, network
protocols, and user-facing Surfaces so one Agent can be reused by Web,
Desktop, TUI, CLI, or an internal application.

Nexum is not a complete chat product tied to one UI, and it is not a giant
`Agent` class containing every capability. It provides sensible defaults while
letting you replace the model, storage, host, MCP connection, protocol client,
or UI.

## Why the name Nexum?

`Nexum` means “connection” or “binding”. The runtime connects Agent semantics,
environment capabilities, protocols, and interaction Surfaces. The name stays
simply Nexum because the project is about composing and reusing these parts,
not about one UI or one kind of Agent.

## Install the published package

Nexum publishes one package for users: `nexum-ai`. The internal source packages
are not separate user-facing installation targets. Install the compiled
artifact and import the pieces you need through subpaths:

```bash
npm install nexum-ai
```

```ts
import { createLocalRuntime } from "nexum-ai/application"
import { Nexum } from "nexum-ai/client"
import { createFilePersistence } from "nexum-ai/persistence/file"
```

See the [module documentation index](docs/modules/README.md) for every public
entry point and its parameters.

## Build your first complete Agent application

If you are new to Nexum, start with [Build a complete Agent application](docs/examples/full-stack-chat.md).
The tutorial creates a SQLite-backed runtime, exposes it through HTTP/SSE, and
connects a client to the Chat Surface. Session listing, switching, history,
renaming, deletion, cancellation, and continuation are documented together in
the [Session guide](docs/capabilities/session.md).

## What problem does Nexum solve?

An Agent application normally contains several concerns that change at
different speeds:

- runtime semantics such as coding loops, Sessions, context compaction,
  permissions, and Skills;
- environment capabilities such as models, files, Shell, databases, events,
  and MCP;
- transport boundaries such as HTTP, SSE, and in-process calls;
- presentation surfaces such as Web, Desktop, TUI, CLI, or a business system.

Nexum keeps these concerns independently understandable and replaceable. Core
owns semantics, Persistence and Integrations provide environment capabilities,
Application composes a runtime, Protocol/Client/Server expose a boundary, and
Surface packages render the state for users.

## What can Nexum do?

Nexum provides:

- streaming coding loops, tool calls, results, continuation, and terminal states;
- Session creation, recovery, update, cancellation, continuation, and concurrency boundaries;
- durable prompt admission through a recoverable Session queue;
- file, Shell, workspace, and host capabilities with permission checks;
- structured Questions, Permission requests, and safe interaction pauses;
- project context, message history, context budgets, compaction, and recovery;
- Skill discovery, registration, validation, invocation, and update events;
- OpenAI-compatible models, model configuration, capability probing, and provider catalogs;
- MCP server registration, discovery, calls, and OAuth lifecycle control;
- replaceable Memory, Persistence, Event, and Protocol ports;
- JSON envelopes, capabilities, ordered events, SSE delivery, stable errors, and restart recovery.

These capabilities fit coding Agents, internal assistants, automation workbenches,
long-running jobs, terminal Agents, and embedded chat components.

## Choose a composition

Start from a complete [composition example](docs/examples/README.md), then
replace only the ports you need:

| Example | Main pieces | Use it when |
| --- | --- | --- |
| [Embedded Agent](docs/examples/embedded-runtime.md) | `nexum-ai/application` + Core + Memory Persistence | Your application calls the Agent in-process |
| [Local file runtime](docs/examples/local-file-runtime.md) | Application + File Persistence | A CLI or desktop app needs restart recovery |
| [SQLite + HTTP/SSE](docs/examples/sqlite-http-runtime.md) | Application + SQLite + Server + Client | Web, desktop, or another language needs a service |
| [Chat Surface](docs/examples/chat-surface.md) | Client + Protocol + Surface Adapter + Chat Surface | You need an embeddable chat UI |

Each example explains the parameters, data flow, and the next document to read.

## When should you replace a module?

| Your goal | Keep | Replace or add |
| --- | --- | --- |
| Embed an Agent in one process | Application + Core | Use `createEmbeddedRuntime` |
| Keep data after a restart | Runtime semantics | File or SQLite Persistence |
| Support multiple clients | Runtime + Persistence | Server + Protocol + Client |
| Use another model provider | Core ports | A `ModelPort` Integration |
| Use a different UI | Runtime + Protocol | Your Surface or a Surface Adapter |
| Add organization-specific tools | Core loop | Application Tool Registry / Host |
| Connect an MCP server | Application | MCP Integration and permissions |

The choice is a composition decision, not a rewrite. Keep the Core semantics
stable and replace the environment adapter, transport, or Surface at the
boundary that needs to change.

## How the modules are divided

```text
┌──────────────────────────────────────────────────────────────┐
│ Surface: Web · Chat · CLI · Desktop · TUI · enterprise app   │
│ layout, interaction, and state projection                    │
└──────────────────────────────┬───────────────────────────────┘
                               │ Client / Surface Adapter
┌──────────────────────────────▼───────────────────────────────┐
│ Protocol / Transport: Protocol · Client · Server              │
│ versioned contracts, envelopes, errors, events, and HTTP/SSE  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Runtime injection
┌──────────────────────────────▼───────────────────────────────┐
│ Application: Runtime Composer, Skill, Tool, and Question      │
│ orchestration                                                 │
└───────────────┬──────────────────────────────┬────────────────┘
                │                              │
┌───────────────▼──────────────┐  ┌────────────▼────────────────┐
│ Core: runtime semantics       │  │ Environment: Persistence     │
│ Loop · Session · Permission   │  │ · Integrations               │
│ Context · Skill · Memory      │  │ file/memory/SQLite/Model/Host│
└──────────────────────────────┘  └─────────────────────────────┘
```

The dependency rule is simple: Core does not import implementation packages;
Persistence and Integrations implement ports; Application composes them;
Client depends on Protocol rather than Core or Server; Surface packages render
protocol state rather than reimplementing the Agent loop.

See [module boundaries](docs/architecture/module-boundaries.md) and the
[module index](docs/modules/README.md) for the detailed map.

The same map is available in the [Chinese README mirror](README.zh-CN.md).

### Package responsibilities

| Package | Boundary | Responsibility | Typical choice |
| --- | --- | --- | --- |
| [`nexum-ai/core`](docs/modules/nexum-core.md) | Runtime foundation | Coding Loop, Session, Permission, Question, Context, Skill, Memory, and ports | Every Runtime |
| [`nexum-ai/persistence`](docs/modules/nexum-persistence.md) | Persistence contract | Store composition and Event Hub ports | Custom storage |
| [`nexum-ai/persistence/memory`](docs/modules/nexum-persistence-memory.md) | Persistence implementation | In-process stores without a file or database | Embedding and tests |
| [`nexum-ai/persistence/file`](docs/modules/nexum-persistence-file.md) | Persistence implementation | Local JSON-file stores with atomic writes | CLI and local apps |
| [`nexum-ai/persistence/sqlite`](docs/modules/nexum-persistence-sqlite.md) | Persistence implementation | SQLite schema, transactions, and restart recovery | Web/Server |
| [`nexum-ai/integrations`](docs/modules/nexum-integrations.md) | External integration | Model, Host, project context, Skill source, and MCP adapters | Replace providers or host capabilities |
| [`nexum-ai/application`](docs/modules/nexum-application.md) | Application composition | Runtime Composer, registries, brokers, and configured loop | Create a complete Runtime |
| [`nexum-ai/protocol`](docs/modules/nexum-protocol.md) | Protocol model | `nexum.runtime.v1`, envelopes, Session, interaction, and event models | Other languages/transports |
| [`nexum-ai/client`](docs/modules/nexum-client.md) | Protocol consumer | HTTP requests, validation, error normalization, and SSE | Web, CLI, desktop, custom clients |
| [`nexum-ai/server`](docs/modules/nexum-server.md) | Protocol binding | Expose a composed Runtime through HTTP/SSE | Local service or backend |
| [`nexum-ai/surface-adapter`](docs/modules/nexum-surface-adapter.md) | Surface adapter | `ChatProtocolAdapter` and chat operation normalization | Reuse chat transport |
| [`nexum-ai/chat-surface`](docs/modules/nexum-chat-surface.md) | UI component | Embeddable chat component and Web Component | In-app chat |
| `nexum-test` | Internal demo | Complete Web workbench that imports `nexum-ai/chat-surface` | Repository validation only |
| `nexum-ai/cli` | Terminal Surface | REPL and runtime management commands | Terminal Agent |

### Dependency direction

```text
nexum-ai/persistence/* ──> nexum-ai/persistence ──> nexum-ai/core
nexum-ai/integrations ─────────────────────────────> nexum-ai/core
nexum-ai/application ──> nexum-ai/core + persistence/* + integrations
nexum-ai/protocol       protocol models only; no Runtime implementation
nexum-ai/client ───────> nexum-ai/protocol
nexum-ai/server ───────> nexum-ai/core + nexum-ai/application + nexum-ai/protocol
nexum-ai/surface-adapter ──> nexum-ai/client
nexum-ai/chat-surface ─────> nexum-ai/surface-adapter
nexum-ai/cli ──────────────> nexum-ai/surface-adapter + nexum-ai/client
```

Core never imports implementation packages. Persistence and Integrations
implement ports; Application composes them; Client does not depend on Core or
Server; and Surfaces do not copy the Agent Loop.

## Runtime events and interaction

Core produces facts, Protocol names them, and a Surface decides how to show
them. Common events include `assistant.text`, `tool.request`, `tool.result`,
`permission.requested`, `question.request`, `context.compaction.*`,
`skill.activated`, and `session.completed/failed/cancelled`.

Long-running input, event sequences, permission waits, Questions, compaction,
and terminal states can be observed and recovered. Start with the [Session
guide](docs/capabilities/session.md), [events and SSE guide](docs/capabilities/events.md),
[Question protocol](docs/ui/question.md), and [Permission protocol](docs/ui/permission.md).

## Documentation

Start at the [Nexum documentation hub](docs/README.md). It is organized for
beginners, with composition examples first and module/API/protocol references
linked from each step.

- [Composition examples](docs/examples/README.md)
- [Capabilities](docs/capabilities/session.md)
- [Module API index](docs/modules/README.md)
- [Runtime API reference](apis/nexum.md)
- [UI interaction protocols](docs/ui/interaction-protocol.md)
- [Architecture](docs/architecture/module-boundaries.md)

Every public usage page has a Chinese mirror. Use the language link at the top
of a page to switch languages; the two versions keep the same sections,
examples, module names, and API references.

## Project status

Nexum currently includes composable Core, Persistence, Integrations,
Application, Protocol, Server, Client, and Surface layers, with file and SQLite
Persistence, HTTP/SSE, CLI, permissions, Questions, Skills, MCP, and execution
recovery covered by implementations or verification entry points. The project
continues to evolve through replaceable ports and versioned protocols.

## License

MIT
