# Plan / Build Agent 模式最终审计

## 结果

实现已完成并提交到 `plan-build-mode` 分支。Session 现在持久化 `plan | build`
模式；Plan 模式由 Core 在 PermissionPort 和 ToolPort 之前强制限制，只允许读取
项目或写入相对路径 `.nexum/plans/`。

## 已完成项

- Core Session 默认 `build`，兼容旧记录，按 Session 队列安全切换模式；运行中切换返回 `session_busy`。
- File、Memory、SQLite Persistence 迁移缺省/非法模式为 `build`，保留显式 `plan`。
- Coding Loop 过滤 Plan 工具、注入模式上下文，并对未暴露工具调用返回 `plan_mode_restricted`。
- Protocol、Server、Client 暴露 `mode` 和 `PUT /api/nexum/session/:id/mode`；非法值返回 400，运行中切换返回 409。
- Surface 增加独立于权限策略的 Plan / Build 控件，支持 pending、失败提示、运行中禁用和按 Session ID 增量同步。
- API、Client、Core、Session 能力文档已同步。

## 验证证据

- `bun run check`：通过，14 个包类型检查通过，Oxlint 通过。
- `packages/nexum-core bun test`：175 pass。
- `packages/nexum-server bun test`：83 pass。
- `packages/nexum-persistence bun test`：30 pass。
- `packages/nexum-persistence-file bun test`：2 pass。
- `packages/nexum-persistence-sqlite bun test`：8 pass。
- `packages/nexum-client bun test`：10 pass。
- `packages/nexum-surfaces bun run typecheck:tsc`：通过。
- `packages/nexum-surfaces bun run build`：通过。
- `git diff --check`：通过；任务 worktree 无未提交改动。

## 未完成与集成阻塞

- 完整 `packages/nexum-surfaces/test/permission.smoke.spec.ts` 当前报告 19 pass、9 fail、6 error；失败集中在既有历史/MCP/模型探测用例的共享浏览器生命周期和重复 `role=alert` 定位，尚未将其归因到本次模式代码，需在独立 UI 测试环境中进一步处理。
- 原始 checkout 有用户已有未提交文档改动，因此没有自动合并或清理任务 worktree；分支和 worktree 保留供审阅。
