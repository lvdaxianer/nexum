# Spec Delta

## ADDED Requirements

### Requirement: ChatSurface SHALL render bounded tool execution state

ChatSurface SHALL 根据有序运行事件渲染工具执行、工具超时、工具失败和工具取消状态；assistant.thinking 心跳 SHALL 不能覆盖已知的工具活动状态。

#### Scenario: Tool activity replaces thinking heartbeat

- **WHEN** ChatSurface 已收到工具请求或工具执行事件，之后继续收到 assistant.thinking 心跳
- **THEN** 页面 SHALL 保持工具活动状态，并不得把该项重新渲染为模型思考

#### Scenario: Tool timeout is recoverable

- **WHEN** ChatSurface 收到工具超时和 failed 的 run.settled
- **THEN** 页面 SHALL 展示超时诊断、保留前序消息，并提供 continue 或 retry 操作

#### Scenario: Reconnect after tool settlement

- **WHEN** 页面在工具超时或取消后断线并从事件游标重连
- **THEN** ChatSurface SHALL 恢复同一工具终态和运行终态，不得重新创建或重复执行工具
