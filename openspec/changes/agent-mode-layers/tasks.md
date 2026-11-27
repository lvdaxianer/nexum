# Tasks

## 1. Core 与 Application 模式默认值

- [x] 1.1 在 `packages/nexum-core/src/index.ts` 为 `NexumSessionServiceOptions` 增加可选 `defaultAgentMode`，按“创建参数 > Service 默认 > build”解析，并为显式覆盖、默认值和运行中切换保留回归测试；运行 `bun test`（`packages/nexum-core`）确认相关测试通过。
- [x] 1.2 在 `packages/nexum-application/src/index.ts` 为 `NexumRuntimeOptions` 暴露 `defaultAgentMode`，仅在自动创建 Session Service 时传入 Core；在 `packages/nexum-application/test` 增加 Runtime 默认模式测试，运行 `bun test`（`packages/nexum-application`）确认配置实际生效。
- [x] 1.3 检查 File/SQLite/Memory 持久化适配器的模式规范化路径，补齐缺失或非法模式回归测试；运行对应包的 `bun test` 确认旧数据恢复为 Build、显式 Plan 保持不变。

## 2. Protocol 与 Client 创建契约

- [ ] 2.1 在 `packages/nexum-protocol/src/index.ts` 将 Session 公共响应的 mode 设为规范化必有值，并保持 `NexumSessionCreateInput` 与 `NexumSessionModeInput` 类型一致；运行 `bun run typecheck`（受影响包）确认跨包类型通过。
- [ ] 2.2 在 `packages/nexum-server/src/index.ts` 核对 Session 创建边界校验、默认值传递和公共投影，增加非法 mode 不落库及显式 mode 覆盖 Runtime 默认的 HTTP 测试；运行 `bun test`（`packages/nexum-server`）确认稳定错误和响应字段。
- [ ] 2.3 在 `packages/nexum-client/src/index.ts` 及 `packages/nexum-client/test/client.test.ts` 验证创建调用能传递 mode 并读取响应模式；运行 `bun test`（`packages/nexum-client`）确认请求 body 和返回类型。

## 3. Surface 创建与模式可见性

- [ ] 3.1 在 `packages/nexum-surfaces/src/main.tsx` 的新建 Session 表单增加 Plan/Build 选择，创建请求传递所选 mode，成功后使用返回快照更新当前 Session；为默认 Build、Plan 创建和创建失败保留表单状态测试。
- [ ] 3.2 在 `packages/nexum-surfaces/src/main.tsx` 和 `packages/nexum-surfaces/src/styles.css` 让 Session 列表、当前 Session 标题/Composer 区同时显示模式，并保持模式控件与权限策略控件语义分离；补充键盘、禁用、忙碌和错误状态断言。
- [ ] 3.3 在 `packages/nexum-surfaces/test/session-state.test.ts` 验证模式快照只增量更新目标 Session，运行 `bun run typecheck:tsc` 和 `bun run build`（`packages/nexum-surfaces`）确认构建产物可用。

## 4. 文档、审查与集成验证

- [ ] 4.1 更新 `apis/nexum.md`、`docs/capabilities/session.md`、`docs/zh-CN/capabilities/session.md`、`docs/modules/nexum-client.md` 和 `docs/zh-CN/modules/nexum-client.md`，写明 Application 默认、Session 覆盖、创建请求和页面展示；用文档中的 curl/代码示例做一次手工核对。
- [ ] 4.2 对照本变更的 `proposal.md`、`design.md`、三个 delta spec 和代码做实现一致性审计，检查三层边界、错误契约、旧数据兼容和页面失败回滚；记录审计结果并修复发现项。
- [ ] 4.3 在任务 worktree 运行 `bun run check`、所有受影响包测试和 `git diff --check`，确认无新增未跟踪构建产物后提交本任务。

## Workflow follow-up

- 通过 `openspec validate --change agent-mode-layers` 和项目要求的 OpenSpec 校验。
- 完成代码审查、合并到 `SOURCE_BRANCH=dev-v0.0.1`，再执行最终集成验证。
- 变更完成后归档 OpenSpec change，并验证归档后的能力规格。
