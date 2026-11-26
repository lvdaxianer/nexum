# Nexum 组合案例

这些案例按使用目标拆分。每个案例都给出完整的组合关系、可复制的 TypeScript 代码、参数解释和下一步文档入口。

| 案例                                             | 适合谁                         | 组合内容                                           |
| ------------------------------------------------ | ------------------------------ | -------------------------------------------------- |
| [在应用内嵌入 Agent](embedded-runtime.md)        | 想在自己的程序里直接调用 Agent | Application + Core + 内存 Persistence + Model      |
| [本地文件持久化](local-file-runtime.md)          | 想保存 Session，重启后继续使用 | Application + File Persistence + Model             |
| [SQLite + HTTP/SSE 服务](sqlite-http-runtime.md) | 想让 Web、桌面端或其他语言接入 | Application + SQLite + Server + Protocol + Client  |
| [接入聊天 UI](chat-surface.md)                   | 想快速得到一个可嵌入的聊天界面 | Client + Protocol + Surface Adapter + Chat Surface |

## 怎么选择

- 先验证 Agent 能力：从[应用内嵌 Agent](embedded-runtime.md)开始。
- 需要保存会话：选择[本地文件持久化](local-file-runtime.md)。
- 需要独立服务或多端接入：选择[SQLite + HTTP/SSE 服务](sqlite-http-runtime.md)。
- 已经有 Server，只缺 UI：选择[接入聊天 UI](chat-surface.md)。

## 案例中的公共模块

- [Application](../modules/nexum-application.md)：组合 Runtime、Session 和 Coding Loop。
- [Core](../modules/nexum-core.md)：定义 Model、Tool、Permission、Session 等运行语义。
- [Persistence](../modules/nexum-persistence.md)：保存 Session、消息、事件和配置。
- [Protocol](../modules/nexum-protocol.md)：定义跨进程、跨语言的数据结构和事件。
- [Client](../modules/nexum-client.md)：调用 HTTP API 和订阅 SSE。
- [Server](../modules/nexum-server.md)：将 Runtime 暴露为 HTTP/SSE。
- [Surface Adapter](../modules/nexum-surface-adapter.md)：把协议操作适配给聊天 UI。
- [Chat Surface](../modules/nexum-chat-surface.md)：提供可嵌入的聊天界面。
