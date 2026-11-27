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
