# `nexum/integrations`

[中文](../zh-CN/modules/nexum-integrations.md)

Integrations connect external systems to Core ports. Import them from
`nexum/integrations`.

## Public API

| API | Input | Returns | Use |
| --- | --- | --- | --- |
| `createOpenAICompatibleModelPort(options)` | model config and request/timeout settings | `ModelPort` | Connect an OpenAI-compatible provider |
| `createLocalHostAdapter(options?)` | working directory and execution boundary | `HostPort` | Files and Shell |
| `createLocalDirectoryValidator()` | none | directory validator | Validate Session directories |
| `createNexumProjectContextPort(options)` | project and context sources | context port | Project instructions and context |
| `createLocalSkillSource(options)` | Skill roots | Skill source | Discover local Skills |
| `createHttpMcpAdapter(options)` | MCP URL, auth, request settings | `McpPort` | HTTP MCP Server |
| `createStdioMcpAdapter(options)` | command, args, environment | `McpPort` | stdio MCP Server |

Adapters are environment boundaries. They do not own Session persistence,
Application orchestration, permission policy, or UI state. See [external
integrations](../capabilities/integrations.md) and [Application](nexum-application.md).
