# Spec Delta

## Purpose

让长时间运行的 Headless Session 在接近模型上下文上限时自动压缩旧历史，同时保留任务目标、项目约束和最近交互，使模型能够安全地继续工作。

## ADDED Requirements

### Requirement: 上下文接近阈值时必须触发压缩

Headless Runtime MUST 根据可替换的上下文估算器和压缩策略判断是否超过阈值，并在下一次模型请求前完成压缩或明确报告失败。

#### Scenario: 上下文未超过阈值

- **WHEN** 当前消息估算量低于配置的压缩阈值
- **THEN** Runtime 原样发送消息历史，不生成压缩事件

#### Scenario: 上下文超过阈值

- **WHEN** 当前消息估算量达到或超过配置的压缩阈值
- **THEN** Runtime 发布 `context.compaction.started`，调用摘要器，并在成功后发布 `context.compaction.completed`

### Requirement: 压缩结果必须保留可继续工作的上下文

压缩后的模型消息 MUST 保留任务目标、项目上下文和配置要求，并保留策略指定数量的最近消息；被移除的旧历史 MUST 由摘要替代。

#### Scenario: 压缩后继续 Function Calling

- **WHEN** 压缩完成后模型需要继续调用工具
- **THEN** 下一次模型请求包含摘要、保留的最近消息、项目上下文和工具定义，且工具调用链可以继续完成

### Requirement: 压缩失败不得静默丢失历史

压缩器失败时 Runtime MUST 发布 `context.compaction.failed`，保留原始历史或将 Session 转为明确失败状态，不得发送不完整的消息历史。

#### Scenario: 摘要器返回错误

- **WHEN** 摘要器无法生成摘要
- **THEN** Runtime 不执行后续工具，并发布包含安全错误消息的失败事件
