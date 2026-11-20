# Headless Runtime Events Specification

## Purpose

为页面提供可排序、可关联、可重连的 Coding Loop 运行事件流。

## ADDED Requirements

### Requirement: 每个运行事件 SHALL 带有标准身份

每个 Headless 事件 SHALL 包含 `eventID`、`runID`、`sessionID`、`type`、`sequence` 和 ISO 8601 `occurredAt`；原有 `data` 字段 SHALL 保持为可选业务数据对象。

#### Scenario: 页面展示工具调用

- **WHEN** Core 发出工具请求事件
- **THEN** 页面可以使用 `runID` 关联当前 Prompt，使用 `sequence` 排序，并使用 `data.toolCallID` 展示工具详情

### Requirement: 会话序列 SHALL 单调递增

同一个会话的事件 `sequence` SHALL 在多次 Prompt 之间持续单调递增，不得因为新的 Prompt 将序列重置为零。

#### Scenario: 同一页面连续提交两次 Prompt

- **WHEN** 两次 Prompt 分别产生事件
- **THEN** 第二次 Prompt 的首个事件序列大于第一次 Prompt 的最后一个事件序列

### Requirement: SSE SHALL 输出标准事件字段

事件流 SHALL 输出 `event`、`id` 和 JSON `data` 字段；`id` SHALL 等于事件 `eventID`，`event` SHALL 等于事件 `type`。

#### Scenario: 页面消费 SSE

- **WHEN** 页面接收一个运行事件
- **THEN** 浏览器 EventSource 可以按类型分发事件，并可使用事件 ID 自动重连

### Requirement: SSE SHALL 支持有限历史重放

服务 SHALL 为每个会话保留有限事件历史，并在请求带有有效 `Last-Event-ID` 时优先发送该事件之后的历史事件，再发送新事件。

#### Scenario: 页面断线后重连

- **WHEN** 页面使用最近收到的事件 ID 重连
- **THEN** 服务先补发可用的后续事件，且不重复发送已确认的事件

### Requirement: 权限请求 SHALL 可被事件流发现

Core 在进入待审批权限状态时 SHALL 发出 `permission.requested` 事件，事件数据 SHALL 仅包含脱敏后的动作、资源和原因。

#### Scenario: 页面发现待审批工具

- **WHEN** Coding Loop 需要人工决定工具权限
- **THEN** 页面可以通过事件刷新权限列表，并且事件不泄露凭据或完整文件内容
