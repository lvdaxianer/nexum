# Tasks

## 1. 消息投影与即时回显

- [x] 1.1 为状态/历史合并和即时用户消息保留行为补充失败回归测试，完成最小投影修复，并验证 `packages/nexum-chat-surface` 的测试与 TypeScript 检查通过
- [x] 1.2 修复发送后的跟随滚动与历史消息去重，验证用户问题和文件摘要在长回复、状态刷新和事件回放后仍然可见且不重复

## 2. 真实浏览器恢复验证

- [x] 2.1 扩展 `packages/nexum-surfaces/test/permission.smoke.spec.ts`，覆盖发送文件 Prompt 后运行完成及页面刷新后的用户消息回显，并验证定向 UI smoke 通过

## 3. 集成验证

- [x] 3.1 执行 OpenSpec strict 校验、`bun run check`、相关构建和 `git diff --check`，确认只保留预期修改

## Workflow follow-up

- 通过代码审查与每项任务审计后提交修复分支。
- 将任务分支合并回 `dev-v0.0.1`，完成闭环检查后归档 OpenSpec change。
