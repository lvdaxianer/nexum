# Design

## Context

CLI 的 Renderer 和 readline 共享终端输出流。权限事件会把 Renderer 状态切换为等待权限并暂停工具活动行，但模型仍可能发送 thinking/reasoning 心跳；当前心跳处理无条件恢复 running 状态并创建动画，因而会覆盖 readline 正在等待的审批输入。详见 proposal.md 与增量规范。

## Goals / Non-Goals

**Goals:**

- 让权限或 Question 交互期间的终端输入行保持稳定、可见、可编辑。
- 保持现有工具暂停、审批回复和恢复执行语义不变。
- 用 Renderer 单元测试锁定 heartbeat 不得覆盖交互提示的行为。

**Non-Goals:**

- 不改变 Server 权限策略、审批接口或 `allow_always` 的匹配范围。
- 不改变模型事件协议或新增超时、自动审批策略。

## Decisions

### 在 Renderer 状态边界拦截 heartbeat

当 Renderer 已处于 `awaiting permission` 或 `awaiting question` 时，`assistant.thinking` 与 `assistant.reasoning` 事件直接保持当前等待状态，不启动 thinking 活动行。这样修复位于覆盖终端输出的源头，且不影响事件泵继续接收事件。

备选方案是让 readline 在交互期间暂停所有 Renderer 输出；该方案会隐藏合法的权限状态更新，并把终端输出协调责任扩散到输入层，因此不采用。

### 以回归测试验证状态和输出

测试先发送权限事件，再发送 thinking/reasoning 心跳，断言状态仍为等待权限、输出不重新出现“正在思考”活动行；随后发送允许后的工具结果，确认既有恢复路径仍然工作。

## Risks / Trade-offs

- [Risk] 权限等待期间模型可能产生真实 reasoning 内容，CLI 会延后或忽略该段瞬态显示 → 该阶段的首要交互是完成审批，事件仍由服务端保留；审批后后续模型事件照常渲染。
- [Risk] 未来新增其他交互等待状态时可能遗漏拦截 → 测试覆盖现有 permission/question 两种状态，并保持判断集中在 Renderer 状态边界。

## Migration Plan

无需数据迁移或配置迁移。升级 CLI 后重新启动 REPL 即可生效；回滚只需恢复 Renderer 变更。
