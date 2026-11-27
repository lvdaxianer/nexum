# Remote MCP Server lifecycle

[中文](../zh-CN/capabilities/mcp.md)

MCP integration registers a remote server, connects it when needed, discovers
tools/resources/prompts, and forwards calls through the Runtime. The UI should
show the current status and authorization state rather than managing a raw
JSON-RPC connection.

## Lifecycle

1. Register the remote URL.
2. Connect and observe the server status.
3. Discover tools, resources, or prompts.
4. Invoke a capability through the Runtime and Permission policy.
5. Disconnect or remove the registration when it is no longer needed.

## HTTP API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/mcp` | List registered server status |
| `POST` | `/mcp` | Register a remote URL |
| `POST` | `/mcp/{id}/connect` | Connect |
| `POST` | `/mcp/{id}/disconnect` | Disconnect |
| `DELETE` | `/mcp/{id}` | Remove registration |
| `GET` | `/mcp/{id}/tools` | Read tools |
| `GET` | `/mcp/{id}/resources` | Read resources |
| `GET` | `/mcp/{id}/prompts` | Read prompts |

OAuth authorization is exposed as an attempt lifecycle: create an attempt,
read its status, complete it with the redirect URL, or cancel it. Exact request
and response fields are in the [Runtime API](../../apis/nexum.md).
