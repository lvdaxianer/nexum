# nexum-run-lifecycle Specification

## Purpose
为 Nexum 的一次 Session 运行建立跨 Core、Protocol 和 Application 的统一生命周期，让客户端能够区分正在重试、已经失败和最终 settled，并能从已有上下文安全继续运行。

## Requirements

### Requirement: Runtime lifecycle SHALL distinguish recoverable and terminal states

Core SHALL 产生模型 Attempt、重试、取消、完成和失败的运行事实；Protocol SHALL 保持这些事实的身份、顺序和安全数据；Application SHALL 只把最终 settled 作为一次运行的终结信号。

#### Scenario: Retry remains active

- **WHEN** 当前模型步骤进入退避等待并将继续重试
- **THEN** Session SHALL 保持运行中，Protocol SHALL 发布包含 attempt、等待时间和 willRetry 的事件，Application SHALL 不得将运行显示为已完成

#### Scenario: Automatic work settles

- **WHEN** 当前运行不再有重试、压缩、工具或后续模型工作
- **THEN** Protocol SHALL 发布一次 run.settled 事件，并携带 completed、failed 或 cancelled 结果

#### Scenario: Event replay preserves lifecycle order

- **WHEN** Application 使用事件游标重新连接
- **THEN** Server SHALL 按稳定 sequence 重放生命周期事件，且不得生成重复的 settled 事件

### Requirement: Continue SHALL reuse the existing conversation context

Protocol SHALL 提供从最后一个可继续上下文启动新 Attempt 的操作；该操作 SHALL 不隐式追加重复的用户 Prompt，并 SHALL 受 Session 并发占用和请求幂等约束保护。

#### Scenario: Continue a failed model run

- **WHEN** 用户对一个已失败但仍有可继续上下文的 Session 发起 continue
- **THEN** Core SHALL 从既有消息历史继续调用模型，并发布新的 runID 或 attempt 身份

#### Scenario: Duplicate continue request

- **WHEN** 同一请求身份的 continue 被提交多次
- **THEN** Server SHALL 返回同一受理结果或当前运行冲突，不得创建两个并发运行

#### Scenario: Continue has no answerable context

- **WHEN** Session 历史末尾没有 user 或 tool result 等可继续消息
- **THEN** Core SHALL 返回稳定的不可继续错误，并不得调用模型或工具

### Requirement: Application SHALL map lifecycle failures to stable public errors

Server SHALL 将请求校验、Session 冲突、不可继续、模型上游失败和运行终态映射为稳定 errorCode、HTTP 状态和 traceId；原始异常和凭据 SHALL 不出现在公共响应中。

#### Scenario: Concurrent prompt or continue

- **WHEN** Session 已有活动运行时再次提交 Prompt 或 continue
- **THEN** Server SHALL 返回冲突错误，并不得启动第二个模型或工具执行链

#### Scenario: Public upstream failure

- **WHEN** 自动重试耗尽并进入最终模型失败
- **THEN** Client SHALL 能通过事件获得安全错误摘要和 traceId，并能选择继续或重新提交
