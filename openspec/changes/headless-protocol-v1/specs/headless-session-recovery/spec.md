# Headless Session Recovery Specification

## Purpose

让页面在首次打开、刷新和事件流断线后恢复会话的权威状态。

## ADDED Requirements

### Requirement: 服务 SHALL 提供会话状态快照

服务 SHALL 提供 `GET /api/experimental/headless/session/:sessionID/state`，返回会话基本信息、待处理权限、待处理 Question 和当前事件序列位置。

#### Scenario: 页面刷新后恢复运行

- **WHEN** 页面请求已有会话状态
- **THEN** 响应包含会话状态、目录、pending 权限、pending Question 和 `lastSequence`

### Requirement: 状态快照 SHALL 使用安全视图

状态快照 SHALL 只返回权限和 Question 所需的脱敏字段，不得返回凭据、完整环境变量、未授权文件内容或内部错误堆栈。

#### Scenario: 页面读取待审批资源

- **WHEN** 状态快照包含待审批工具
- **THEN** 页面能看到动作和脱敏资源，但不能读取凭据或未授权的文件正文

### Requirement: 不存在会话 SHALL 返回稳定错误

服务 SHALL 对不存在的会话返回 HTTP 404 和标准错误 Envelope，不得返回空的成功快照。

#### Scenario: 页面使用过期会话 ID

- **WHEN** 页面请求已被清理的会话
- **THEN** 页面可以根据错误码清理本地状态并回到新建会话流程

### Requirement: 状态快照与事件流 SHALL 可组合

页面 SHALL 能先读取状态快照，再使用 `lastSequence` 或最近事件 ID 建立 SSE 订阅，从而避免刷新期间遗漏后续事件。

#### Scenario: 页面先快照后订阅

- **WHEN** 页面先获得 `lastSequence` 再连接事件流
- **THEN** 服务可以从该位置之后重放事件，并继续推送新事件
