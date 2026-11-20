# Headless Core 协议标准化设计

日期：2026-11-20

状态：已确认，进入实现

## 背景

Headless Core 的价值是把模型配置之外的 coding 链路、权限机制、补充信息、上下文压缩和 Skill 能力提供给任意 UI。当前 REST 和 SSE 已可用于 POC，但不同接口的响应结构和事件恢复语义还没有形成统一的页面接入协议。

## 目标

- 页面通过标准 HTTP/JSON 接口创建会话、提交 Prompt、处理权限和 Question。
- 页面通过能力发现知道当前 Core 支持的协议版本、能力和事件类型。
- 页面通过会话状态快照恢复刷新前的运行状态。
- 页面通过带身份和序列的 SSE 事件流渲染时间线，并支持断线重连。
- Core 内部实现可以继续演进，页面只依赖稳定的协议 Schema。

## 外部协议

### REST 成功响应

```json
{
  "data": {},
  "meta": {
    "protocolVersion": "headless.v1",
    "traceId": "trace_01"
  }
}
```

### REST 错误响应

```json
{
  "errorCode": "SESSION_NOT_FOUND",
  "message": "Session was not found",
  "traceId": "trace_01",
  "meta": {
    "protocolVersion": "headless.v1",
    "traceId": "trace_01"
  }
}
```

### SSE 事件

```text
event: assistant.text
id: evt_01
data: {"eventID":"evt_01","runID":"run_01","sessionID":"sess_01","sequence":4,"type":"assistant.text","occurredAt":"2026-11-20T03:00:00.000Z","data":{"content":"完成"}}
```

事件身份由 `eventID`、`runID`、`sessionID`、`sequence`、`occurredAt` 组成。页面以 `sequence` 排序，以 `Last-Event-ID` 请求断线后的有限历史，以状态快照作为权威状态来源。

## 页面接入时序

1. `GET /capabilities` 检查协议版本和能力。
2. `POST /session` 创建会话，保存 `sessionID`。
3. `GET /session/:sessionID/state` 获取初始状态和 `lastSequence`。
4. 连接 `GET /session/:sessionID/events`，携带 `Last-Event-ID`（如有）。
5. 使用 `POST /session/:sessionID/prompt` 提交用户输入。
6. 收到 `permission.requested` 或 `question.request` 后读取列表并提交决定/答案。
7. 断线后先读取状态快照，再使用最近事件 ID 重连。

## 安全边界

协议只返回安全视图；凭据只用于服务端请求，不进入响应或事件。工具资源、错误消息和日志必须脱敏。当前 POC 不负责认证和租户隔离，生产必须在已鉴权的网关或宿主进程后运行，并限制 CORS、目录范围和权限 API 的访问主体。

## 验证方式

- 协议 Schema 测试覆盖 Envelope、能力、快照和事件身份。
- Core 测试覆盖跨 Prompt 序列单调递增、run ID 和权限事件。
- Server 测试覆盖能力、快照、统一错误、SSE 字段和重放。
- 生成客户端检查确保 Schema 与客户端同步。
- 协议文档中的路由、字段和示例与实现逐项核对。
