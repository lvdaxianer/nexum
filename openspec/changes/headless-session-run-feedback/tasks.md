# Tasks

## 1. Core Session 运行语义

- [x] 1.1 在 `packages/headless-core/test/session.test.ts` 增加终态 Session 重新进入 `running` 的失败测试，先运行该测试确认当前 `invalid_transition` 失败，再修改 `isAllowedTransition` 并更新状态机断言使测试通过。
- [x] 1.2 在 `packages/headless-core/test/coding-loop.test.ts` 增加同一 Session 连续运行两次的回归测试，先确认第二次运行失败，再实现活动运行清理和终态重启支持，验证两轮都产生 `session.completed`。
- [x] 1.3 为运行中 Session 增加活动运行保护测试，验证重复启动不会覆盖现有运行，并运行 `cd packages/headless-core && bun test test/session.test.ts test/coding-loop.test.ts`。

## 2. Server Prompt admission

- [x] 2.1 在 `packages/headless-server/test/server.test.ts` 增加已完成 Session 二次 Prompt 的失败测试和运行中重复 Prompt 的 409 冲突测试，确认当前契约暴露出假 `accepted` 问题。
- [x] 2.2 修改 `packages/headless-server/src/index.ts`，在 Prompt 入口拒绝运行中的 Session，返回稳定错误码和 traceId；保留非运行状态异步 accepted，并确保 Coding Loop 异步异常进入可观察的终态事件。
- [x] 2.3 运行 `cd packages/headless-server && bun test test/server.test.ts`，验证二次 Prompt、重复提交、SSE 完成事件和既有权限流程均通过。

## 3. UI 思考状态与恢复

- [x] 3.1 在 `packages/headless-ui/test/permission.smoke.spec.ts` 增加发送后显示思考卡片、首个文本事件替换卡片、完成后输入恢复的失败测试，并确认测试先失败。
- [x] 3.2 修改 `packages/headless-ui/src/main.tsx`，增加临时 Assistant 思考 ChatItem、事件驱动的替换/终态投影、失败恢复和刷新快照恢复；运行 `cd packages/headless-ui && bun test test/permission.smoke.spec.ts --timeout 15000` 验证通过。
- [x] 3.3 修改 `packages/headless-ui/src/styles.css`，实现思考点动画、静态 reduced-motion 降级和失败/完成视觉状态；运行 `cd packages/headless-ui && bun run typecheck:tsc && bun run build` 验证通过。

## 4. 集成验证与交付

- [ ] 4.1 在任务 worktree 运行 `bun run check`，修复本次变更引入的类型、格式和测试问题，并保留原有测试结果。
- [ ] 4.2 运行真实服务器级验证：对已完成 Session 再次提交 Prompt，确认 200 accepted、SSE 收到文本和 completed；对运行中 Session 重复提交确认 409。
- [x] 4.3 完成代码审查、OpenSpec 校验和任务审计，更新任务勾选状态，提交符合项目规范的修复 commit，并将任务分支合并回 `dev-v0.0.1`。

## Workflow follow-up

- 部署合并后的前端与后端不可变 release，执行浏览器级思考动画和二次 Prompt 验证。
- 完成部署验证后归档 OpenSpec change，并保留上一 release 作为回滚目标。
