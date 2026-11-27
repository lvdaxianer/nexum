# `nexum/cli`

[中文](../zh-CN/modules/nexum-cli.md)

The CLI is the terminal Surface shipped with `nexum`; install the package once
and use the `nexum` binary. It consumes the same protocol as Web surfaces and
does not own Core execution or business decisions.

## Start

```bash
nexum --help
nexum status
nexum session list
```

The Server URL is resolved from `--server`, then `$NEXUM_API_URL`, then
`http://127.0.0.1:4097`. Exit codes are `0` success, `1` failure, `2` usage
error, and `130` user cancellation.

## Commands

| Command | Purpose |
| --- | --- |
| `nexum` | Enter the REPL and lazily create a Session |
| `nexum resume` | Choose a Session to resume; `-c` resumes the latest |
| `nexum session list` | List Sessions |
| `nexum session create [--dir <path>] [--name <name>]` | Create a Session |
| `nexum session delete <id>` | Delete a Session |
| `nexum prompt <text> [--session <id>]` | Run one streaming Prompt |
| `nexum status` / `nexum doctor` | Inspect connection or diagnose configuration |
| `nexum theme [dark\|light\|auto]` | Read or update local theme |
| `nexum model get\|set\|probe` | Read, update, or probe model configuration |
| `nexum role-prompt get\|set <file>\|reset` | Manage the default role prompt |
| `nexum skill ...`, `nexum mcp ...`, `nexum permission ...` | Manage runtime capabilities |

## REPL shortcuts

`/help`, `/new`, `/sessions`, `/use <id>`, `/resume`, `/model`, `/skills`,
`/mcp`, `/permissions`, `/events`, `/cancel`, `/continue`, `/theme`, and
`/quit` cover the common Session and runtime operations.

See the [Session guide](../capabilities/session.md) for the same operations as
Client APIs.

## REPL and rendering

The REPL keeps a selected Session ID, streams the same Protocol events as a Web
Surface, and exposes `/sessions`, `/use <id>`, `/events`, `/cancel`, and
`/continue` for the common lifecycle. Thinking/reasoning output is a display
choice; it must not change the underlying event or Session semantics.

The CLI is a Surface. It calls Client and Surface Adapter APIs, while Server,
Application, and Core remain responsible for persistence, execution, tools,
Permission, Question, and recovery.
