# Tasks

## 1. Protocol 与 Server 事件契约

- [x] 1.1 在 `packages/nexum-protocol/src/index.ts` 导出完整的 `NEXUM_EVENT_TYPES` 常量和 `NexumEventType` 字面量联合，明确包含 `assistant.thinking`、`assistant.reasoning`、`assistant.text`；先补协议测试并验证测试在实现前失败。
- [x] 1.2 为 reasoning、thinking、assistant text 增加公开事件数据类型约束，并验证 `packages/nexum-protocol/test/protocol.test.ts` 能编译并通过。
- [x] 1.3 让 `packages/nexum-server/src/index.ts` 复用 Protocol 事件清单，补能力发现回归测试，并在 `packages/nexum-server` 目录运行 `bun test`。

## 2. Core 事件回归

- [ ] 2.1 补充 Core 测试，验证 reasoning 增量按模型返回顺序发布、工具事件或最终文本之后不再追加到旧 reasoning 段，并验证不生成虚假 reasoning；运行 `packages/nexum-core` 的目标测试。

## 3. UI 连续 transcript

- [x] 3.1 先更新 `packages/nexum-surfaces/test/permission.smoke.spec.ts`，把旧的思考卡片断言改为连续 reasoning transcript、工具行与最终回答分离，并验证新断言在实现前失败。
- [x] 3.2 重构 `packages/nexum-surfaces/src/main.tsx` 的聊天投影：增加独立 `reasoning` 条目，合并同一 run 的增量，按后续事件关闭段，保持 eventID 去重和底部跟随；验证 reasoning 不会进入最终 assistant 正文。
- [x] 3.3 更新 UI 样式为弱化的连续流文本和实时光标，移除卡片式思考动画；运行 `packages/nexum-surfaces` 的 typecheck 与定向 Playwright smoke，并检查窄宽度和滚动时仍可读。

## 4. 集成验证

- [ ] 4.1 运行 `openspec validate --strict --change nexum-reasoning-transcript`，确认规范、设计和任务清单完整。
- [ ] 4.2 在任务 worktree 运行 `bun run check`、相关包测试和 UI smoke；确认 git diff 只包含本变更及必要文档。

## Workflow follow-up

- 每个实现任务先在对应任务分支完成 RED，再完成 GREEN，并在代码审查和任务关闭审计后提交。
- 将已完成任务分支合并回当前 Nexum 集成分支 `dev-v0.0.1`，保留用户已有的未跟踪文件。
- 完成后运行 OpenSpec verify/archive，并做最终 worktree 与测试审计。
