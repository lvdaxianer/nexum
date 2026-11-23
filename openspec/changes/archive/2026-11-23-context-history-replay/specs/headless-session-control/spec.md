# Spec Delta

## MODIFIED Requirements

### Requirement: 页面可以恢复事件与运行队列

页面 SHALL 能重新连接当前 Session 的 SSE 事件流、加载该 Session 的 canonical 对话历史，并刷新待审批权限和待回答 Question；事件内容 SHALL 继续经过服务端安全脱敏。

#### Scenario: 页面刷新后恢复
- **WHEN** 页面重新加载且存在当前 Session 标识
- **THEN** 页面重新加载该 Session 的分页消息历史、连接事件流并刷新权限、Question 和 Session 状态，不要求用户重新创建任务

#### Scenario: 事件流断开
- **WHEN** SSE 连接断开
- **THEN** 页面显示断线状态，保留已展示的事件和对话消息，并提供可重复点击的重新连接操作
