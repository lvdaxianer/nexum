# Agent Mode Layers Task 1 Audit

## Scope

- Core `NexumSessionServiceOptions.defaultAgentMode` 与显式 Session mode 覆盖。
- Application `NexumRuntimeOptions.defaultAgentMode` 向自动创建的 Core Session Service 传递。
- File/SQLite/Memory 持久化对旧记录缺失 mode 的 Build 兼容路径。

## Review

- [通过] 默认值解析位于 Core，未把领域规则复制到 Application。
- [通过] 显式 `create({ mode })` 优先于 Runtime/Service 默认值。
- [通过] 自定义 Session Service 不被 Application 隐式改写，符合设计中的依赖注入边界。
- [通过] 未修改生产日志；无新增敏感字段或异常响应。
- [通过] 未引入新的持久化格式；旧记录继续由已有适配器规范化为 `build`。

## Evidence

- `packages/nexum-core`: `bun test test/session.test.ts`，16 pass。
- `packages/nexum-application`: `bun test test/runtime.test.ts`，19 pass。
- `packages/nexum-persistence`: `bun test`，30 pass。
- Core/Application `bun run typecheck:tsc`，通过。

## Result

Task 1 满足 `agent-mode-selection` 的 Core/Application 约束，可以进入下一任务。
