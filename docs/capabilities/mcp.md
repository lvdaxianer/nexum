# MCP Server lifecycle

[中文](../zh-CN/capabilities/mcp.md)

MCP integration registers either a remote HTTP server or a local stdio server,
connects it when needed, discovers tools/resources/prompts, and forwards calls
through the Runtime. The UI should show the current status and authorization
state rather than managing a raw JSON-RPC connection.

## Lifecycle

1. Register an HTTP or stdio configuration.
2. Connect and observe the server status.
3. Discover tools, resources, or prompts.
4. Invoke a capability through the Runtime and Permission policy.
5. Disconnect or remove the registration when it is no longer needed.

## HTTP API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/mcp` | List registered server status |
| `POST` | `/mcp` | Register an HTTP or stdio server |
| `POST` | `/mcp/{id}/connect` | Connect |
| `POST` | `/mcp/{id}/disconnect` | Disconnect |
| `DELETE` | `/mcp/{id}` | Remove registration |
| `GET` | `/mcp/{id}/tools` | Read tools |
| `GET` | `/mcp/{id}/resources` | Read resources |
| `GET` | `/mcp/{id}/prompts` | Read prompts |

OAuth authorization is exposed as an attempt lifecycle: create an attempt,
read its status, complete it with the redirect URL, or cancel it. Exact request
and response fields are in the [Runtime API](../../apis/nexum.md).

An HTTP registration uses `url`:

```json
{
  "id": "remote-search",
  "name": "Remote Search",
  "transport": "http",
  "url": "https://example.com/mcp"
}
```

A local registration uses `transport: "stdio"`, `command`, and `args`:

```json
{
  "id": "github-tools",
  "name": "GitHub Tools",
  "transport": "stdio",
  "command": "node",
  "args": ["./mcp/github-server.mjs"],
  "cwd": "/workspace/project",
  "env": { "GITHUB_HOST": "github.com" }
}
```

The Runtime owns the child process and passes its stdin/stdout to the MCP SDK;
`cwd` and `env` are applied only to that child. Do not put tokens or other
credential-shaped values in `env`; those keys are rejected before persistence.
A stdio server does not use
OAuth or a URL. Both forms can be supplied as `mcpServers` when creating a
local Runtime. The configuration Store persists them by `id`; reusing the same
`id` with the same normalized configuration is a no-op, while a different
configuration fails instead of silently overwriting the persisted entry.

## Status and retry behavior

The normal status flow is `disabled → pending → retrying → connected`. A
temporary connection failure is retried with bounded delays; invalid
configuration, a request for user authorization, or an explicit disconnect
does not start an automatic retry loop. The Runtime owns the connection and
cleans up the transport and timers when a server or Runtime closes.

The status snapshot may expose a retry attempt and next retry time, but it must
not expose authorization headers, cookies, tokens, secrets, API keys, or OAuth
credentials. A UI can poll while a server is `pending` or `retrying` and stop
polling when the page is hidden or unloaded.

## OAuth boundary

OAuth uses a short-lived attempt ID, expiry, cancellation, state, and PKCE
verifier. Prefer a loopback callback on `127.0.0.1`; when a browser callback is
not available, submit the complete redirect URL to the completion endpoint.
Tokens and client secrets are stored in the credential store and are never
returned by the list, event, tool, or error APIs.

## Tool bridge

Connected tools are registered in the Application Tool Registry with names of
the form `mcp__{server_namespace}__{tool_name}` and retain the MCP
`inputSchema`. Execution still passes through normal Permission and cancellation
boundaries. Tool/resource/prompt catalog changes trigger a refresh event rather
than requiring the UI to create its own JSON-RPC transport.
