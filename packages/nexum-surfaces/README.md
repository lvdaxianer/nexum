# Nexum Reference Surfaces（内部）

`@nexum/surfaces` 是仓库内的 Web 参考 Surface 和 Test Workbench UI，不是发布包的公共入口，也不建议作为生产依赖。用户应安装 `nexum`，再选择自己的 Web、Desktop、TUI 或 `nexum/chat-surface`。

本模块把 Protocol/Client 事件投影成聊天、权限、Question、工具和状态视图，用来验证可替换 Surface 的边界。它不承载 Core 的工具执行、权限决策或 Session 业务规则。

仓库内运行：`bun run dev:surface`，或使用 `bun run --cwd packages/nexum-surfaces build` 构建参考页面。
