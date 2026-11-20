# Spec Delta

## Purpose

为 Headless UI 提供可读、可追踪的聊天式 Agent 执行流，让用户能够在同一条对话时间线上理解 Prompt、模型回复、工具调用、权限门禁、补充信息和上下文状态变化。

## ADDED Requirements

### Requirement: 聊天流展示用户与 Agent 消息

Headless UI SHALL 按 Session 展示用户提交的 Prompt、Agent 文本回复和对应时间信息，并在流式事件到达时持续更新当前 Agent 消息。

#### Scenario: 用户提交 Prompt 后进入聊天流

- **WHEN** 用户在有效 Session 中提交非空 Prompt
- **THEN** 页面立即展示一条用户消息，并保留发送中状态直到 Core 接受或拒绝该 Prompt

#### Scenario: Agent 文本按事件流追加

- **WHEN** Core 推送同一轮运行的多个 Agent 文本事件
- **THEN** 页面将文本按事件顺序追加到同一条 Agent 消息中，且不会重复展示已消费的事件

### Requirement: 执行事件以可读卡片嵌入聊天流

Headless UI SHALL 将 Skill 激活、工具请求、工具结果、权限请求、补充信息、上下文压缩和失败事件渲染为聊天流中的可区分执行卡片。

#### Scenario: 工具执行过程可追踪

- **WHEN** Core 推送工具请求和工具结果事件
- **THEN** 页面在对应 Agent 消息下展示工具名称、执行状态和安全摘要，并允许查看结构化详情

#### Scenario: 权限或补充信息暂停运行

- **WHEN** Core 推送权限请求或补充信息请求
- **THEN** 页面在聊天流中展示待处理卡片、可用操作和明确的等待状态，且运行状态同步为等待处理

#### Scenario: 上下文压缩和 Skill 状态可见

- **WHEN** Core 推送上下文压缩或 Skill 激活/失败事件
- **THEN** 页面展示对应的过程卡片，并在成功、失败或进行中状态之间更新

### Requirement: 运行失败、取消和断线可恢复

Headless UI SHALL 在聊天流中保留失败、取消和连接断开信息，并提供不丢失当前 Session 与输入上下文的恢复入口。

#### Scenario: 运行失败后保留对话

- **WHEN** Core 推送运行失败事件
- **THEN** 页面保留已有用户和 Agent 消息，新增失败卡片并允许用户继续发送或重试

#### Scenario: 用户取消运行

- **WHEN** 用户取消正在运行的 Session
- **THEN** 页面展示取消中的忙状态，完成后追加取消结果，并恢复可继续输入的状态

#### Scenario: SSE 断开后重新连接

- **WHEN** SSE 连接异常断开
- **THEN** 页面展示断线提示和重新连接操作，重连后按事件 ID 去重，不重复渲染历史事件

### Requirement: 聊天流在窄屏下保持可用

Headless UI SHALL 在窄屏布局中优先保证聊天消息、执行卡片和 Prompt 输入可读可操作，并将非核心运行状态折叠或移至次要区域。

#### Scenario: 窄屏继续完成一次 Prompt

- **WHEN** 页面宽度低于桌面布局阈值
- **THEN** 用户仍能查看聊天消息、展开执行卡片、输入 Prompt 和处理权限/补充信息，不需要横向滚动
