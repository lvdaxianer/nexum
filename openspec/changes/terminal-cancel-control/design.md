# Design

## Context

See `proposal.md` for the user-visible motivation. 当前 Core 已维护 Session 生命周期，Protocol State 已返回 Session 状态，但没有公开“是否允许取消”的领域能力；ChatSurface 只判断 Session 是否存在，因此运行完成或空闲时仍然渲染取消入口。

## Goals / Non-Goals

**Goals:**

- 由 Core 产生单一的 `canCancel` 领域判断。
- 由 Protocol State 传递 `canCancel`，由 Server 负责投影，应用层只消费该字段。
- 对终态取消请求返回稳定冲突错误，而不是返回成功假象。
- 继续保留取消确认、忙碌态、错误反馈和真正运行中的取消能力。
- 用 Core、Protocol/Server 契约测试和真实浏览器测试覆盖完成态与运行态。

**Non-Goals:**

- 不改变 Session 状态枚举或事件名称。
- 不重构整个 composer 布局。

## Decisions

### 1. Core 负责可取消能力和取消边界

Core 以 Session 的 `running` 状态作为可取消条件，导出纯领域判断供 Server 投影，并在 `cancel` 入口再次校验。相比让应用层自行判断，这能避免不同客户端产生不同状态；相比只隐藏按钮，能阻止绕过 UI 的无效取消请求。

### 2. Protocol 显式传递能力字段

在 `NexumSessionState` 增加 `canCancel`，Server 使用 Core 判断填充。客户端、Surface Adapter 和测试 fixture 同步该字段；不修改已有事件名称和 Session 状态枚举。

### 3. 应用层只消费协议能力

ChatSurface 以状态快照中的 `canCancel` 作为初始值，并在状态事件到达时同步；取消确认中的控件保持可见直到请求结束。相比在组件中复制状态白名单，应用层不会与 Core 漂移。

### 4. 分层回归验证

Core 测试能力判断和终态取消拒绝，Protocol/Server 测试 State 字段和稳定错误，应用 smoke 测试运行中显示、完成后隐藏以及取消后隐藏。

## Risks / Trade-offs

- [Risk] 事件状态短暂落后可能让按钮短暂保留 → 页面初始化使用 Protocol `canCancel`，终态事件到达后立即更新并由响应式渲染移除入口。
- [Risk] 等待权限或问题时隐藏按钮会阻止用户取消 → 这两种状态属于明确的可取消运行态，继续保留入口。

## Migration Plan

新增 State 字段为向后兼容的响应字段；无数据迁移。发布前先部署 Core/Server/Protocol，再更新应用层；若出现回归，可回滚应用层而不影响已保存 Session，或整体回滚能力字段提交。
