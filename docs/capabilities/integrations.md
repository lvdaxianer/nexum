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

## Local files, Host, and project context

The local directory validator checks that a Session directory is absolute,
exists, is a directory, and is accessible. Host operations resolve paths inside
that directory; paths outside the boundary are rejected. The default Shell is
`sh`, and a host can provide another shell through its options.

Project context sources return only successfully read configuration entries and
deduplicate them by `sourceID`. A Skill source normalizes roots and rejects
symbolic links, unsafe relative paths, and unreadable files before a Skill is
shown to a user.

## Model and credential boundary

The model adapter reads configuration and credentials on the backend and sends
the upstream authorization header. Credential values never appear in Protocol
responses, events, history, or error details. The public model view exposes
configuration such as `baseUrl`, `model`, and whether a credential is
configured, not the credential itself.

## Replacing an integration

An adapter must preserve the Core port contract, convert provider failures to
stable domain errors, propagate `AbortSignal`, and return only safe fields.
Core must not import a Node API, network SDK, or UI package merely because an
integration needs it.
