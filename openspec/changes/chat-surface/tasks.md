# Tasks

## 1. ChatSurface 协议适配器与包边界

- [x] 1.1 新增 `@nexum/chat-surface` 包、公共类型和 `ChatProtocolAdapter` 契约，覆盖历史、状态、事件、Prompt、运行控制、Permission、Question 和 Skill 列表；先写契约测试并验证测试在缺少实现时按预期失败，再实现并运行该包测试与 `bun run typecheck:tsc`。
- [x] 1.2 基于 `@nexum/client` 实现默认协议适配器，验证历史分页、SSE sequence 恢复、Permission/Question 回复、Skill 列表和稳定错误映射测试通过。

## 2. 完整聊天组件与 Web Component

- [x] 2.1 将消息历史、事件投影、reasoning、工具、Permission、Question、Skill 和运行状态抽为 Solid `ChatSurface`，验证加载、发送、重连、取消、继续和交互状态测试通过。
- [x] 2.2 增加 `<nexum-chat>` Web Component 包装器、属性/事件契约和 CSS Variables，验证独立 DOM 挂载、Session 切换、卸载清理和 Modal 尺寸下的组件 smoke 测试通过。

## 3. 现有页面宿主迁移

- [x] 3.1 将 `packages/nexum-surfaces/src/main.tsx` 的聊天区域替换为 ChatSurface，保留 Session、模型、Role Prompt、Skill 注册和策略管理；验证现有 Surface 的 Session 切换和聊天流程仍由新组件承载。
- [ ] 3.2 增加独立嵌入示例和组件使用文档，运行 Surface 定向 smoke、`typecheck:tsc`、构建和根目录 `bun run check`，并验证 `openspec validate chat-surface --strict` 通过。

## Workflow follow-up

- 完成每项任务的 TDD、代码审查、前端交互审计、验证和原子提交后，合并回 `dev-v0.0.1`。
- 全部任务完成后运行 OpenSpec verify，完成最终审计并归档 `chat-surface`。
