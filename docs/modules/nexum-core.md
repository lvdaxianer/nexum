# `nexum/core`

[中文](../zh-CN/modules/nexum-core.md)

Import types and ports from `nexum/core`.

## Responsibility

Core is the UI-agnostic Agent runtime. It defines the domain ports and rules
for Models, Tools, Permissions, Questions, Sessions, Context, Memory, Skills,
Hosts, and MCP, and owns the Coding Loop, function calling, compaction, and
recovery semantics.

## Public API concepts

| API | Important input | Use |
| --- | --- | --- |
| `ModelPort.prompt(input)` | `sessionID`, `text`, `messages`, `tools`, `signal` | Stream one model request |
| `NexumCodingLoop.run(input)` | `sessionID`, `text` | Run a task with tools and interactions |
| `NexumSessionService.create(input)` | `directory`, optional `name` | Create a Session |
| `ToolPort.execute(request)` | Session, tool, action, resource, input | Execute an authorized tool request |
| `NexumRolePromptStore.update(prompt)` | `prompt` | Update the Runtime role prompt |

The Coding Loop assembles history, role prompt, Skills, and project context into
the model-visible messages. A user's task is `text`; it is not the role prompt.

## Port boundaries

`ModelPort` streams model output, `ToolPort` executes approved tools,
`PermissionPort` handles decisions, `SessionStore` and `MessageStore` persist
state, and `HostPort`/`MemoryPort`/`McpPort` connect environment capabilities.
Application and Integration modules provide the default implementations.

Core must not depend on HTTP, a UI, a concrete model SDK, or a concrete
Persistence adapter. See [module boundaries](../architecture/module-boundaries.md).
