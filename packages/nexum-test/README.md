# Nexum Test Workbench（内部）

`@nexum/test` 是跨层验证和可启动 Test Workbench，不是生产运行时，也不是发布包公共入口。它用真实的 Core、Application、Protocol、Client、Server 和 Surface 验证完整链路。

它重点验证 Session、Coding Loop、工具、Permission、Question、Skill、Context、HTTP/SSE、事件和 SQLite 重启恢复。内存 Persistence 只用于明确的临时组合，不替代真实恢复测试。

仓库内运行：`bun run dev`；自动化验证：在该包目录执行 `bun test` 和 `bun run typecheck:tsc`。用户不应从 `@nexum/test` 导入运行时能力。
