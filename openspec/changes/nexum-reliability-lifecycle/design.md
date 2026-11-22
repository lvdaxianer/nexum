# Design

## Context

当前 Nexum Core 已有单 Agent Coding Loop、模型流、工具调用、上下文压缩和有限模型重试。`NexumModelError` 只有少量类别，OpenAI-compatible Adapter 将大部分非成功响应归入 `unavailable`；Coding Loop 只在没有产生增量时重试，并通过 `model.retry` 发布退避事件。Protocol 已有事件联合类型，Server 以异步 accepted 响应启动运行，Application Surface 通过 SSE 消费运行事件。

本变更必须保持三层边界：Core 不依赖 HTTP、SSE 或 UI；Protocol 不包含运行决策；Application 不自行判断模型错误是否可重试。现有 PermissionPort、工具工作目录边界、一次 step 一次模型流和 Session 并发占用保持不变。

## Goals / Non-Goals

**Goals:**

- 建立可扩展的模型失败分类、RetryPolicy、Attempt 和取消边界。
- 将重试、超时、压缩恢复和最终 settled 状态表达为可重放的 Protocol 事件。
- 提供不重复追加用户消息的继续运行操作。
- 让 Server 和 Surface 在自动重试期间保持运行态，并在最终 settled 后结束一次运行。
- 为后续持久化 execution recovery 保留稳定的 runID、attempt 和 sequence 边界。

**Non-Goals:**

- 本变更不实现分布式 Session ownership、跨进程 execution claim 或 exactly-once 工具执行。
- 本变更不引入 Subagent、Plan Mode、工具并行执行或 Provider 自动切换。
- 本变更不改变现有权限策略和工具工作目录安全边界。

## Decisions

### 1. Adapter 分类，Core 决策

Adapter 将 HTTP 状态、供应商错误码、Retry-After 和网络异常转换为 Core 可识别的结构化失败。Core 只消费稳定的 `retryable`、`kind` 和等待元数据，决定是否重试、何时取消以及何时 settled。

这样可以避免 Core 依赖 OpenAI 或其它供应商格式，也避免 Application 重复实现一套错误分类。相较于让 Adapter 自己循环重试，该方案能统一 Session 状态、事件顺序和取消语义。

### 2. RetryPolicy 只重放未产生可见增量的模型步骤

保持现有安全约束：如果一次模型流已经产生 reasoning、text 或工具调用增量，失败后不透明重放同一个步骤。没有增量的可重试失败才进入指数退避、抖动和最大等待时间控制。

上下文超限不属于普通重试：Core 先执行一次上下文压缩，然后重新发起当前步骤；压缩失败或再次超限进入最终失败。

### 3. 使用稳定的运行事件而不是 UI 推断状态

Protocol 新增 Attempt 和 settled 事件。`session.completed`、`session.failed`、`session.cancelled` 仍是 Session 终态；`run.settled` 表示本次自动工作已经没有待执行的重试、压缩、工具或模型请求。Application 只根据这些事件维护运行态，不根据某个中间失败事件猜测任务结束。

### 4. Continue 是上下文操作，不是新的 Prompt

Continue API 只允许从消息历史末尾为 user 或 tool result 的 Session 恢复。Core 不追加新的 user message；Server 仍复用 Session busy 保护，重复的活动请求返回冲突。若历史没有可继续消息，返回稳定的不可继续错误。

新增 HTTP 操作使用实验性 Nexum 路径，避免在行为尚未稳定时承诺稳定外部兼容性；Protocol、Client 和 Surface 同步使用同一请求身份与错误契约。

### 5. Timeout 通过 AbortSignal 贯穿边界

模型请求、流空闲等待和工具执行使用同一个运行级取消信号，并叠加配置的 deadline。超时由 Core 转换为稳定失败，Adapter 和 Host 负责尊重 AbortSignal。对于无法立即中断的底层 Promise，Core 不会把其结果继续接入当前运行。

## Risks / Trade-offs

- [Risk] 流已经输出后不自动重试可能让用户需要手动继续。→ 通过 `continue` 操作保留恢复能力，避免重复文本和副作用。
- [Risk] 供应商错误码不统一。→ Adapter 只输出有限稳定类别，保留脱敏的 providerCode/status 供诊断，并用 429、5xx、网络错误和永久 4xx 测试分类。
- [Risk] 事件类型增加会扩大 Client 和 Surface 兼容面。→ 新事件保持可选数据、稳定 sequence，并由 Protocol 单一事件联合类型生成/验证。
- [Risk] 工具超时无法强制终止不支持取消的实现。→ 发送 AbortSignal、停止接收其结果，并在文档与测试中明确工具 Adapter 必须实现取消语义。

## Migration Plan

1. 先发布兼容的 Core 错误元数据和事件类型，保留已有 `model.retry` 事件字段。
2. 再接入 Server 的实验性 continue 路由和 Client/Surface 行为。
3. 运行 Core、Protocol、Server、Client、Surface 和根级检查；失败时回滚整个变更，不单独开启部分生命周期事件。
4. 后续持久化 execution recovery 可复用本变更的 runID、attempt、sequence 和 settled 契约。
