# External integrations capability

[中文](../zh-CN/capabilities/integrations.md)

Integrations connect Core ports to external technology. They provide models,
host/file operations, project context, Skill sources, and MCP without changing
the runtime semantics.

| Capability | Port | Purpose |
| --- | --- | --- |
| Model | `ModelPort` | Stream model output and tool requests |
| Host | `HostPort` | Files, Shell, working directory, and sandbox boundary |
| Project context | context port | Load project instructions and metadata |
| Skill source | `NexumSkillSource` | Discover and read local Skill directories |
| MCP | `McpPort` | JSON-RPC tools, resources, prompts, and calls |

## Replacement rules

Keep adapters at the boundary. To use a company model gateway, implement or
configure a `ModelPort`; to use remote storage, implement the Persistence
ports; to restrict files or Shell, provide a `HostPort`/sandbox and keep Core
Permission policy in place. Do not copy integration code into Application or
UI packages.

See [Application](../modules/nexum-application.md), [Core](../modules/nexum-core.md),
and [MCP lifecycle](mcp.md).
