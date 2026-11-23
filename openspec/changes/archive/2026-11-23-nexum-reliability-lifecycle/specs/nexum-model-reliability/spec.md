# Spec Delta

## Purpose

为 Nexum 模型调用提供可区分、可取消、可恢复的失败语义，使短暂的上游故障能够安全重试，而认证、请求和响应错误不会被错误地重复发送。

## ADDED Requirements

### Requirement: Model failures SHALL expose stable retry classification

模型适配器 SHALL 将失败转换为稳定的类别，并提供安全的上游状态信息；调用方 SHALL 能区分网络、超时、限流、上游服务、认证、无效请求、上下文超限和无效响应。

#### Scenario: Retryable upstream failure

- **WHEN** 模型请求因网络中断、请求超时、限流或上游服务暂时不可用而失败
- **THEN** 运行时 SHALL 将失败标记为可重试，并保留安全的重试等待信息

#### Scenario: Permanent request failure

- **WHEN** 模型请求因认证失败、无效请求、无效响应或未配置而失败
- **THEN** 运行时 SHALL 将失败标记为不可重试，并不得自动再次发送相同请求

#### Scenario: Context overflow

- **WHEN** 模型服务明确拒绝当前上下文大小
- **THEN** 运行时 SHALL 将失败标记为上下文超限，并交给上下文恢复流程处理

### Requirement: Model retry SHALL be bounded and cancellable

Core SHALL 按显式 RetryPolicy 执行有限次数的指数退避重试，支持抖动、最大等待时间和 AbortSignal；达到上限后 SHALL 返回原始稳定失败。

#### Scenario: Retry succeeds before the limit

- **WHEN** 首次模型请求发生可重试失败且后续请求成功
- **THEN** 运行时 SHALL 在不重复已产生可见增量的前提下完成当前模型步骤

#### Scenario: Retry limit is exhausted

- **WHEN** 连续可重试失败次数达到配置上限
- **THEN** 运行时 SHALL 停止自动重试并发布最终失败语义

#### Scenario: Cancellation during backoff

- **WHEN** 用户在重试等待期间取消 Session
- **THEN** 运行时 SHALL 中止等待和后续模型请求，并将 Session 收敛到 cancelled

### Requirement: Partial model output SHALL not be replayed automatically

当一次模型流已经产生 reasoning、text 或其它可见增量后发生失败，Core SHALL 不自动重新发送同一模型步骤，以避免重复输出或重复副作用。

#### Scenario: Stream fails after visible output

- **WHEN** 模型流已经产生至少一个增量后连接失败
- **THEN** 运行时 SHALL 保留已观察到的失败上下文并结束当前步骤，不得透明重放该请求

### Requirement: Model and tool calls SHALL have bounded waiting

Application 提供的模型请求、流读取和工具执行 SHALL 接受取消信号并具有可配置的总时限或空闲时限；超时 SHALL 转换为稳定、可观察的失败。

#### Scenario: Model stream becomes idle

- **WHEN** 模型流在配置的空闲时限内没有继续产生数据
- **THEN** 运行时 SHALL 取消该调用并按超时策略处理，而不是无限等待

#### Scenario: Tool execution exceeds its limit

- **WHEN** 工具执行超过配置的最大时限
- **THEN** 运行时 SHALL 发送工具失败结果或终止错误，并保留 Session 的可恢复终态
