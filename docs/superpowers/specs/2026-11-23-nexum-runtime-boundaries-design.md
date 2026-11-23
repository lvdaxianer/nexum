# Nexum Runtime Boundary Redesign

## Status

Draft for implementation. This change is a deliberate breaking package-boundary change. The old `@nexum/adapters` package and its aggregate exports are removed; no compatibility facade is retained.

## Problem

`packages/nexum-adapters` currently mixes four different responsibilities:

- infrastructure adapters such as file stores, OpenAI-compatible models, local Host, and MCP;
- application services such as Skill Registry, Tool Registry, and Question Broker;
- domain/application policy logic such as permission policy evaluation;
- the default Runtime Composer.

The Core package also still creates concrete in-memory defaults for message storage, permission-policy storage, and session storage. This makes the package name and dependency graph misleading, and it weakens the intended rule that Core defines semantics and Ports while the host supplies implementations.

## Goals

1. Make every package and source directory have one clear architectural responsibility.
2. Keep Core free of concrete persistence, filesystem, network, and provider implementations.
3. Make persistence adapters replaceable independently from model, Host, MCP, and UI integrations.
4. Keep Skill, Tool, Question, and Permission behavior as application/domain services rather than misnaming them as adapters.
5. Preserve the existing runtime and HTTP/Protocol behavior unless a behavior change is required to remove a Core fallback.
6. Remove the old aggregate package and all in-repository references to `@nexum/adapters`.

## Non-goals

- No new database backend, model provider, UI framework, or MCP transport implementation.
- No Protocol or Server HTTP contract change.
- No compatibility package or deprecated re-export for `@nexum/adapters`.
- No redesign of permission semantics, Skill semantics, or Runtime lifecycle beyond removing infrastructure fallbacks.

## Target packages

### `@nexum/core`

Core owns domain semantics, stable errors, Ports, and UI-independent runtime services. It must not instantiate concrete default stores or import filesystem, network, provider, or persistence implementations.

The following remain Core concepts:

- `SessionStore`, `MessageStore`, `InteractionStore`, `EventSink`, `MemoryPort`, `ModelPort`, `HostPort`, `McpPort`, and related contracts;
- Session service, Coding Loop, Permission Broker, Skill Invocation, Runtime lifecycle, model probing, and protocol-neutral domain errors;
- permission policy rule types, matching/evaluation, dangerous-operation classification, and policy-store Port;
- Skill Registry Port and Skill Invocation semantics.

The following concrete defaults leave Core:

- in-memory SessionStore;
- in-memory MessageStore;
- in-memory PermissionPolicyStore;
- any other fallback that constructs a concrete external-capability implementation.

Core constructors receive required runtime Ports explicitly. Default composition belongs to `@nexum/application`.

### `@nexum/persistence`

This package owns state storage implementations. It may use Node/Bun filesystem APIs, JSON encoding, atomic file replacement, and process-local maps.

It contains:

- in-memory and JSON-file SessionStore;
- in-memory and JSON-file MessageStore;
- JSON-file InteractionStore;
- in-memory and JSON-file EventHub/history;
- in-memory and JSON-file MemoryPort;
- in-memory and JSON-file ModelConfigStore;
- in-memory and JSON-file RolePromptStore;
- in-memory and JSON-file PermissionPolicyStore;
- Skill registration persistence used by the application Skill Registry.

Store contracts and domain-level error types are imported from Core. File-format and persistence failures remain owned by this package when they are implementation-specific.

### `@nexum/integrations`

This package owns adapters that translate external technology into Core Ports:

- OpenAI-compatible HTTP ModelPort;
- local filesystem/Shell HostPort;
- local directory validation;
- MCP JSON-RPC mapping and injected HTTP/stdio/IPC transports;
- filesystem-backed project-context loading;
- local filesystem Skill source scanning and reading.

Integration code does not own Skill registration policy, Tool registration, permission policy evaluation, or Runtime composition.

### `@nexum/application`

This package owns application services and the default composition root:

- Skill Registry orchestration over a Skill Source and registration Store;
- built-in Tool Registry and tool execution orchestration;
- Question Broker and its process-local waiting state;
- configured Coding Loop factory;
- embedded and local Runtime Composer;
- application-level wiring of Core, Persistence, and Integrations.

This package may depend on Core, Persistence, and Integrations. Server consumes the composed Runtime and does not construct infrastructure implicitly.

### Existing protocol and surface packages

- `@nexum/protocol` remains the wire contract.
- `@nexum/client` remains the protocol client and event consumer.
- `@nexum/server` remains HTTP/SSE binding. Its production entrypoint consumes the local Runtime Composer from Application; request handlers only consume Core/application contracts.
- `@nexum/surfaces` remains the UI/Surface layer and continues to consume Client/Protocol state only.
- `@nexum/test` remains the cross-layer verification workbench.

## Source migration map

| Current source | Target | Treatment |
| --- | --- | --- |
| `session-store.ts` | `nexum-persistence` | move file and in-memory implementation |
| `message-store.ts` | `nexum-persistence` | keep Port/error in Core; move implementations |
| `interaction-store.ts` | `nexum-persistence` | move file implementation; keep Port/error contract in Core |
| `events.ts` | `nexum-persistence` | move EventHub and JSON history implementation |
| `memory.ts`, `in-memory-memory.ts` | `nexum-persistence` | move file/in-memory implementations |
| `model-config.ts` | `nexum-persistence` | move in-memory/file stores; keep config contract in Core |
| `role-prompt.ts` | `nexum-persistence` | move in-memory/file stores; keep contract in Core |
| `permission-policy.ts` | Core + `nexum-persistence` | keep policy semantics in Core; move store CRUD implementations |
| `skill-registry.ts` | Application + Integrations + Persistence | split orchestration, local source scanning, and registration persistence |
| `local-host.ts` | `nexum-integrations` | move as Local Host adapter |
| `directory.ts` | `nexum-integrations` | move as local directory adapter |
| `openai-model.ts` | `nexum-integrations` | move as provider adapter |
| `mcp.ts` | `nexum-integrations` | move as MCP integration adapter |
| project-context portion of `context.ts` | `nexum-integrations` | move filesystem reader; keep Port in Core |
| question portion of `context.ts` | `nexum-application` | move Question Broker implementation; keep Port/error in Core |
| `local-tools.ts` | `nexum-application` | move Tool Registry and execution orchestration |
| `configured-loop.ts` | `nexum-application` | move configured loop factory |
| `index.ts` | `nexum-application` | replace aggregate exports with explicit Runtime Composer exports |

## Dependency rules

```text
@nexum/persistence ───────> @nexum/core
@nexum/integrations ──────> @nexum/core
@nexum/application ───────> @nexum/core + @nexum/persistence + @nexum/integrations

@nexum/client ────────────> @nexum/protocol
@nexum/server ────────────> @nexum/core + @nexum/application + @nexum/protocol
@nexum/surfaces ──────────> @nexum/client
@nexum/test ──────────────> core + application + persistence + integrations + protocol + client + server + surfaces
```

No package may import the removed `@nexum/adapters`. Core must not import Persistence, Integrations, Application, Server, Protocol, Client, or Surface.

## Runtime behavior

`createEmbeddedRuntime` and `createLocalRuntime` move to `@nexum/application`.

- Embedded Runtime explicitly injects in-memory persistence implementations and local/default integrations.
- Local Runtime explicitly injects JSON-file persistence implementations and local integrations.
- Both composers accept replacement Ports and preserve the existing override behavior.
- The local Runtime keeps the existing `.nexum` file names and recovery semantics.
- Question and Permission waiting state remains process-local; the InteractionStore continues to persist resumable UI-visible summaries and mark stale `pending` records as `orphaned`.

## Error ownership and identity

There are currently Core/Adapter `instanceof` failures for `NexumMessageStoreError` and `NexumModelConfigError` in the baseline test suite. The migration must establish one canonical exported constructor per error contract and ensure every implementation and test imports that constructor from the same package path. Error mapping and stable error codes must remain unchanged.

## Verification

The implementation is complete only when all of the following are true:

1. `packages/nexum-adapters` and the `@nexum/adapters` package name no longer exist.
2. `rg` finds no source, test, manifest, lockfile, README, OpenSpec, or plan reference to `@nexum/adapters` or `nexum-adapters`, except historical archived records explicitly marked as history if they are intentionally retained.
3. Core boundary tests prove no concrete default stores or infrastructure imports remain in Core.
4. Package dependency tests prove the target graph and reject reverse imports.
5. Persistence tests cover every moved file/in-memory store and preserve restart, atomic-write, corruption, deletion, and orphan recovery behavior.
6. Integration tests cover model streaming/error mapping, Host path boundaries/cancellation, MCP mapping, and local context/Skill source behavior.
7. Application tests cover Skill Registry, Tool Registry, Question Broker, and both Runtime profiles.
8. Server, Test Workbench, and Surface smoke tests pass against the new imports.
9. `bun run check` passes from the repository root; package tests/typechecks are run from their package directories.
10. Documentation describes the new package boundaries and no longer presents application services as adapters.
