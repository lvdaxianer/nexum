# Spec Delta

## MODIFIED Requirements

### Requirement: 页面可以恢复事件与运行队列

页面 SHALL 能重新连接当前 Session 的 SSE 事件流，并刷新待审批权限和待回答 Question；事件内容 SHALL 继续经过服务端安全脱敏。收到当前 Session 的完成、失败或取消终态事件后，页面 SHALL 按稳定 Session ID 增量更新 Session 列表中的对应状态，不得要求用户手动刷新列表才能看到本轮结果。页面还 SHALL 能读取 execution/recovery 状态，并在重启恢复、恢复耗尽或恢复等待人工操作时显示 caller-safe 状态。

#### Scenario: 运行完成后同步 Session 列表

- **WHEN** 当前 Session 收到 `run.settled` 或对应的终态事件
- **THEN** 左侧 Session 列表中的该项立即显示 `completed`、`failed` 或 `cancelled`，其他 Session 项保持不变

#### Scenario: 页面刷新后恢复

- **WHEN** 页面重新加载且存在当前 Session 标识
- **THEN** 页面加载该 Session 的分页消息历史、重新连接事件流并刷新权限、Question、Session 状态和 execution/recovery 状态，不要求用户重新创建任务

#### Scenario: 事件流断开

- **WHEN** SSE 连接断开
- **THEN** 页面显示断线状态，保留已展示的事件，并提供可重复点击的重新连接操作

#### Scenario: 显示重启后的恢复状态

- **WHEN** Session 存在未完成 claim 且服务已重新启动
- **THEN** 页面显示恢复中、等待人工继续或恢复次数耗尽等稳定状态
- **AND** 页面不展示内部锁、恢复文件路径或原始异常堆栈
