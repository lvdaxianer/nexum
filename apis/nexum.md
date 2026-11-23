# Nexum Runtime API

本文是 Nexum Runtime 对外 API 的使用说明。协议模型的权威定义位于 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md)，服务端装配位于 [`packages/nexum-server`](../packages/nexum-server/README.md)。

## 协议约定

| 项目 | 约定 |
| --- | --- |
| 协议版本 | `nexum.runtime.v1` |
| HTTP 前缀 | `/api/nexum`；继续运行实验性接口使用 `/api/experimental/nexum` |
| 健康检查 | `/health/live`、`/health/ready` |
| 响应格式 | JSON Envelope：`data` + `meta.protocolVersion` + `meta.traceId` |
| 事件传输 | SSE；事件包含 `eventID`、`runID`、`sessionID`、`sequence` 和 `occurredAt` |

## 资源与操作

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/nexum/capabilities` | 能力发现和事件类型发现 |
| `GET` / `PUT` | `/api/nexum/model` | 读取和保存模型配置 |
| `POST` | `/api/nexum/model/probe` | 探测模型能力 |
| `GET` / `POST` | `/api/nexum/session` | 列出或创建 Session |
| `GET` / `PUT` | `/api/nexum/session/:sessionID` | 读取或更新 Session |
| `GET` | `/api/nexum/session/:sessionID/state` | 获取恢复状态 |
| `POST` | `/api/nexum/session/:sessionID/prompt` | 提交长任务 Prompt |
| `POST` | `/api/experimental/nexum/session/:sessionID/continue` | 从既有 User/Tool 上下文继续运行；实验性接口 |
| `POST` | `/api/nexum/session/:sessionID/cancel` | 取消当前运行 |
| `GET` | `/api/nexum/session/:sessionID/events` | 订阅 SSE 事件流 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/permission...` | 查询和回复权限请求 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/question...` | 查询、回答和取消结构化反问 |
| `GET` / `POST` | `/api/nexum/skills...` | Skill 列表、注册、刷新、校验和激活 |

## 事件语义

Core 只产生运行事实，Server 将事实编码为协议事件，应用层决定如何呈现。常用事件包括：

- `assistant.thinking`、`assistant.reasoning`、`assistant.text`：模型输出及思考状态；
- `tool.request`、`tool.result`：工具调用和工具结果；
- `permission.requested`：需要用户确认的权限请求；
- `question.request`、`question.result`、`question.cancelled`：结构化反问生命周期；
- `context.compaction.started`、`context.compaction.completed`、`context.compaction.failed`：上下文压缩；
- `skill.activated`、`skill.failed`：Skill 生命周期；
- `model.attempt`、`model.retry`：模型尝试与自动重试；
- `session.completed`、`session.failed`、`session.cancelled`：Session 终态。
- `run.settled`：一次运行最终结算，`result` 为 `completed`、`failed` 或 `cancelled`。

因此，UI 不应通过解析模型文本来猜测是否需要反问或展示权限卡片，而应消费对应的协议事件。

Session state 快照还包含 `canContinue`，表示当前持久化历史是否以可继续的 `user` 或 `tool` 消息结尾。应用层恢复页面时应优先使用该字段决定是否展示 Continue 操作。

## 实验性：继续运行

### 接口概览

`POST /api/experimental/nexum/session/:sessionID/continue` 用于在一次运行失败后，从已持久化的最后一个 `user` 或 `tool` 消息继续执行。请求不会追加新的用户 Prompt。接口返回 `accepted` 后，调用方应订阅 SSE，并以 `run.settled` 判断本轮最终状态。

### 请求

```http
POST /api/experimental/nexum/session/{sessionID}/continue
Content-Type: application/json
```

请求体必须是 JSON 对象；当前没有业务字段，使用 `{}`。路径中的 `sessionID` 必填。可选请求头 `X-Trace-Id` 用于排障关联，格式为 1-128 位字母、数字、`.`、`_`、`:` 或 `-`；非法值会生成新的 trace ID。请求 Cookie 不适用；当前认证约定待确认。

### 成功响应

响应 Header：`Content-Type: application/json`、`Cache-Control: no-store`、`X-Trace-Id: trace_example_001`。

```json
{
  "data": { "status": "accepted" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_example_001" }
}
```

### 错误响应

错误 Header：`Content-Type: application/json`、`Cache-Control: no-store`、`X-Trace-Id` 与响应体中的 `traceId` 一致。示例：

```json
{
  "errorCode": "NEXUM_SESSION_RUN_CONFLICT",
  "message": "Session 当前正在运行，请等待本轮完成后再继续",
  "traceId": "trace_example_002",
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_example_002" }
}
```

| HTTP 状态码 | `errorCode` | 触发条件 | 调用方处理 |
| --- | --- | --- | --- |
| `400` | `NEXUM_INVALID_REQUEST` | 请求体不是 JSON 对象 | 修正为 `{}` 后重试 |
| `404` | `NEXUM_SESSION_NOT_FOUND` | Session 不存在 | 不要继续重试相同 ID |
| `409` | `NEXUM_SESSION_RUN_CONFLICT` | Session 已在运行 | 等待 `run.settled` 后重试 |
| `409` | `NEXUM_SESSION_NOT_CONTINUABLE` | 没有可继续的 User/Tool 上下文 | 提交新的 Prompt |
| `503` | `NEXUM_CONTINUE_NOT_CONFIGURED` / `NEXUM_CONTINUE_FAILED` | Runtime 未配置或 Continue 不可用 | 按服务状态稍后重试 |

错误体沿用统一 Envelope 外的稳定错误结构，包含 `errorCode`、中文 `message`、`traceId` 和协议元数据；不会返回内部异常文本。

Continue admission 是按 Session 原子化的：同一 Session 的并发请求只有一个可以返回 `accepted`，其他请求返回 `NEXUM_SESSION_RUN_CONFLICT`。收到 `accepted` 后不要重复提交，等待 SSE 的 `run.settled`。

### curl 示例

```bash
curl --request POST 'http://127.0.0.1:4097/api/experimental/nexum/session/session_001/continue' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

## 示例

```bash
curl http://127.0.0.1:4097/api/nexum/capabilities

curl -N \
  http://127.0.0.1:4097/api/nexum/session/session_001/events
```

完整链路验证使用 [`@nexum/test`](../packages/nexum-test/README.md)：

```bash
bun run --cwd packages/nexum-test dev
```

客户端实现详见 [`@nexum/client`](../packages/nexum-client/README.md)。
