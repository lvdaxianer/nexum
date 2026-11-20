# Headless Protocol v1 设计

## Context

Headless Core 的目标是让任意页面或宿主 UI 复用同一条 coding 链路。当前服务已经以 REST 暴露命令，以 SSE 暴露运行事件，但成功响应、错误响应、事件身份和页面恢复信息尚未形成统一协议。页面因此需要依赖实现细节，并且无法可靠地处理刷新、断线和重复提交。

## Goals / Non-Goals

### Goals

- 让页面只依赖公开的 v1 协议，不依赖 Core 内部类型。
- 统一成功响应、错误响应、Trace ID 和协议版本。
- 让事件可排序、可关联、可重连，并保留现有事件数据字段。
- 让页面可以通过能力发现和状态快照完成初始化和恢复。
- 保持当前模型、权限、Question、上下文和 Skill 的业务语义。

### Non-Goals

- 本变更不实现新的认证、租户隔离或生产级网关。
- 本变更不引入 WebSocket、GraphQL 或新的模型 Provider 抽象。
- 本变更不重写已有 Coding Loop，也不改变工具执行授权策略。

## Decisions

### 1. HTTP/JSON 命令 + SSE 事件

命令继续使用 HTTP/JSON，实时运行信息继续使用 SSE。HTTP 适合页面请求、重试和网关治理；SSE 适合服务端单向事件流，并且浏览器原生支持自动重连。

### 2. 响应 Envelope 保留现有 data 字段

成功响应采用 `{ data, meta }`，其中 `meta.protocolVersion` 固定为 `headless.v1`，`meta.traceId` 用于关联日志。错误响应保留顶层 `errorCode`、`message`、`traceId`，并增加相同的 `meta`，避免破坏已有调用方，同时给新 UI 一个明确的 v1 入口。

### 3. 事件 ID 与会话序列同时存在

每个事件包含 `eventID`、`runID`、`sessionID`、`sequence`、`occurredAt`。`sequence` 用于同一会话内排序和恢复，`runID` 用于区分一次 Prompt 运行，`eventID` 用于 SSE `id` 和日志关联，`occurredAt` 用于客户端时间线展示。

### 4. 服务端保留有限事件历史

Event Hub 为每个会话保留有限数量的最近事件。客户端通过 `Last-Event-ID`（或协议允许的序列参数）请求重放；历史不存在时继续发送当前事件，并由状态快照补齐权威状态。这样不会把无限日志存储在内存中。

### 5. 状态快照是恢复的权威来源

页面连接事件流前先读取能力和会话状态，再订阅 SSE。刷新或断线后，页面使用状态快照恢复 pending 权限和 Question，使用事件流补齐时间线。重复权限或 Question 提交必须由服务端保持幂等或返回稳定错误。

## Alternatives Considered

- WebSocket：双向能力更强，但浏览器、网关和断线恢复复杂度更高，不适合当前 POC 的单向事件流。
- 仅返回内部对象：实现简单，但会把 Core 内部结构泄露给 UI，后续迁移成本高。
- 每个事件只带序号：无法区分不同 Prompt 运行，也不利于跨服务日志追踪，因此保留 `runID` 和 `eventID`。

## Risks / Trade-offs

- 增加响应元数据会使所有客户端都需要理解 `meta`，但可通过生成客户端和统一 Schema 降低迁移成本。
- 有限重放不能替代永久事件日志；历史缺失时必须重新拉取状态快照。
- POC 暂无认证，协议只能在受信任的内网或已完成鉴权的宿主进程后使用。

## Migration Plan

1. 先扩展协议 Schema 和生成客户端，再由服务端统一产出 Envelope。
2. 保留现有顶层错误字段和事件数据字段，页面可以渐进迁移。
3. 页面按“能力发现 → 状态快照 → SSE 订阅 → 命令提交”的顺序接入。
4. 验证核心、服务端、协议和生成客户端后，再将协议文档作为 UI 接入依据。

## Open Questions

- 生产环境的认证凭据、租户边界和权限策略由宿主网关还是 Core Adapter 提供，留给后续部署设计确定。
