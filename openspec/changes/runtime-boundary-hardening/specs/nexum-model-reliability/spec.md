# nexum-model-reliability Specification Delta

## MODIFIED Requirements

### Requirement: Model and tool calls SHALL have bounded waiting

Application 提供的模型请求、Model Probe、流读取和工具执行 SHALL 接受取消信号并具有可配置的总时限或空闲时限；超时 SHALL 取消底层调用并转换为稳定、可观察的失败。

#### Scenario: Model Probe becomes idle

- **WHEN** Model Probe 在配置的 deadline 内没有产生所需能力响应
- **THEN** Core SHALL 取消底层模型调用并返回 `timeout` 失败，Server SHALL 返回稳定的 Probe 超时错误

#### Scenario: Model stream becomes idle

- **WHEN** 模型流在配置的空闲时限内没有继续产生数据
- **THEN** 运行时 SHALL 取消该调用并按超时策略处理，而不是无限等待

#### Scenario: Tool execution exceeds its limit

- **WHEN** 工具执行超过配置的最大时限
- **THEN** 运行时 SHALL 发送工具失败结果或终止错误，并保留 Session 的可恢复终态

#### Scenario: Request cancellation reaches the Probe

- **WHEN** HTTP 请求在 Model Probe 完成前被客户端取消
- **THEN** Probe SHALL 收到同一个 AbortSignal，并停止后续能力探测
