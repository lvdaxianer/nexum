# Spec Delta

## ADDED Requirements

### Requirement: Shell execution SHALL settle within a bounded deadline

本地 Shell 工具 SHALL 使用默认且可配置的执行截止时间；达到截止时间、收到取消信号或输出流异常关闭时，工具调用 SHALL 返回稳定结果，不得无限等待。

#### Scenario: Shell command exceeds the deadline

- **WHEN** Shell 命令在配置的截止时间内没有退出
- **THEN** 运行时 SHALL 终止该命令及其子进程，并返回可识别的超时失败

#### Scenario: Shell command is cancelled

- **WHEN** Session 在 Shell 执行期间被用户取消
- **THEN** 运行时 SHALL 终止该命令及其子进程，并返回 cancelled 结果

#### Scenario: Shell output stream does not close

- **WHEN** Shell 子进程已经退出但 stdout 或 stderr 仍被后台子进程保持打开
- **THEN** 运行时 SHALL 在清理截止时间内结束输出读取并结算工具调用，不得继续等待 EOF
