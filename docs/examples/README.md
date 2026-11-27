# Composition Examples

[中文](../zh-CN/examples/README.md)

Choose a complete composition first. Each example explains what the pieces do,
where parameters go, and which module page to read next.

| Example | Composition | Best for |
| --- | --- | --- |
| [Complete Agent application](full-stack-chat.md) | SQLite + Server + Client + Chat Surface | First-time users who want the full path |
| [Embedded runtime](embedded-runtime.md) | Application + Core + Memory | In-process calls and small experiments |
| [Local file runtime](local-file-runtime.md) | Application + File Persistence | CLI and desktop applications |
| [SQLite + HTTP/SSE](sqlite-http-runtime.md) | Application + SQLite + Server + Client | Web, multi-client, and cross-language access |
| [Chat Surface](chat-surface.md) | Client + Surface Adapter + Chat Surface | Adding a ready-made chat UI |

The examples use the one published `nexum` package. Internal `@nexum/*` names
appear only when a page explains source boundaries; they are not separate
packages to install.

## How to choose

- Start with [Complete Agent application](full-stack-chat.md) when you want to
  see the backend, persistence, transport, client, and UI together.
- Use [Embedded runtime](embedded-runtime.md) when the host already owns the UI
  and only needs an in-process Agent.
- Use [Local file runtime](local-file-runtime.md) when a local app needs restart
  recovery without a separate service.
- Use [SQLite + HTTP/SSE](sqlite-http-runtime.md) for Web, desktop, CLI, or
  cross-language clients.
- Use [Chat Surface](chat-surface.md) when a Server already exists and only the
  embeddable chat UI is missing.

## Shared modules

- [Application](../modules/nexum-application.md) composes Runtime services.
- [Core](../modules/nexum-core.md) owns runtime semantics and ports.
- [Persistence](../modules/nexum-persistence.md) stores recoverable state.
- [Protocol](../modules/nexum-protocol.md) defines cross-process data.
- [Client](../modules/nexum-client.md) calls HTTP/SSE and consumes events.
- [Server](../modules/nexum-server.md) exposes the Runtime boundary.
- [Surface Adapter](../modules/nexum-surface-adapter.md) bridges a UI to Client.
- [Chat Surface](../modules/nexum-chat-surface.md) renders an embeddable chat.
