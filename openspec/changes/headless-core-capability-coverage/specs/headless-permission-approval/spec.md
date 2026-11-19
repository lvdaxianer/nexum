# Spec Delta

## Purpose

确保 Headless UI 无法绕过 OpenCode 的权限边界执行文件、Shell 或其他副作用工具，并能安全地处理审批、拒绝、取消和敏感信息展示。

## ADDED Requirements

### Requirement: 每次副作用工具执行前必须审批

Runtime MUST 在每次文件写入、编辑或 Shell 工具执行前评估规范化的 action/resource；未获得允许时不得调用工具实现。

#### Scenario: pending 请求阻塞工具

- **WHEN** PermissionPort 返回 `ask`
- **THEN** Session 保持等待状态并发布唯一 pending request，工具执行次数保持为零

#### Scenario: allow-once 执行一次

- **WHEN** UI 对 pending request 回复 `allow_once`
- **THEN** 当前调用执行一次，审批请求完成且不会重复执行

### Requirement: 拒绝和取消必须阻止副作用

Runtime MUST 将 `deny`、请求取消和 Session 取消转换为明确的失败或取消终态，并保证被拒绝工具没有副作用。

#### Scenario: UI 拒绝写入

- **WHEN** UI 对写入请求回复 `deny`
- **THEN** Session 发布失败事件，目标文件不存在，且不会继续请求模型

#### Scenario: 运行中取消 pending 权限

- **WHEN** Session 在权限等待期间被取消
- **THEN** pending request 被清理，Session 发布取消事件，工具执行次数为零

### Requirement: 权限事件和错误必须脱敏

Runtime MUST 从权限请求、SSE 事件和安全错误中移除 API Key、Authorization Header 及其他凭据值，同时保留可审计的工具名称和资源摘要。

#### Scenario: Shell 参数包含凭据

- **WHEN** Shell 工具输入包含 Authorization Header 或 API Key
- **THEN** UI 可见事件只包含脱敏占位符，不包含原始凭据
