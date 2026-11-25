# Spec Delta

## ADDED Requirements

### Requirement: Tool execution SHALL have an observable terminal outcome

运行时 SHALL 为工具执行发布开始、完成、失败、超时和取消中的可观察状态；工具未能正常退出时，运行 SHALL 仍在有限时间内进入 failed 或 cancelled 终态。

#### Scenario: Tool timeout settles the run

- **WHEN** 工具执行超过截止时间
- **THEN** Protocol SHALL 发布工具超时结果并最终发布一次 failed 的 run.settled 事件

#### Scenario: Tool cancellation settles the run

- **WHEN** 用户取消正在执行的工具
- **THEN** Protocol SHALL 发布工具取消结果并最终发布一次 cancelled 的 run.settled 事件

#### Scenario: Cleanup itself exceeds its deadline

- **WHEN** 工具进程无法在优雅终止期限内退出
- **THEN** 运行时 SHALL 执行硬清理并发布稳定的清理失败摘要，不得把 Session 永久留在 running
