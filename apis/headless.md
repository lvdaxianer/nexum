# Headless Core Protocol v1

Headless Core 是与 UI 解耦的 coding runtime。页面只需要对接本协议，就可以完成模型配置、创建会话、提交 Prompt、接收模型和工具事件、处理权限审批、回答 Question、观察上下文压缩/项目上下文，以及在刷新或断线后恢复状态。

本文是 Headless API 模块的唯一协议文档，当前以中文为主。协议实现位于 `packages/protocol`，HTTP 服务位于 `packages/headless-server`，Coding Loop 位于 `packages/headless-core`。

## 1. 协议基础

| 项目     | 约定                                                 |
| -------- | ---------------------------------------------------- |
| 协议版本 | `headless.v1`                                        |
| 默认地址 | `http://127.0.0.1:4097`                              |
| 命令传输 | HTTP + JSON                                          |
| 事件传输 | Server-Sent Events（SSE）                            |
| URL 前缀 | `/api/experimental/headless`                         |
| 默认认证 | POC 不实现认证；生产必须置于已鉴权网关或宿主进程之后 |
| Cookie   | 不使用                                               |
| 时间格式 | ISO 8601 UTC 字符串                                  |

### 1.1 接入顺序

1. `GET /capabilities` 确认协议版本、能力和事件类型。
2. `POST /session` 创建会话，保存 `data.id`。
3. `GET /session/:sessionID/state` 获取权威状态和 `lastSequence`。
4. 连接 `GET /session/:sessionID/events`，断线重连时携带 `Last-Event-ID`。
5. `POST /session/:sessionID/prompt` 提交用户输入。
6. 根据事件或状态快照处理权限、Question 和终态。

## 2. 通用消息格式

### 2.1 请求头

| Header                           | 必填                 | 说明                                                                  |
| -------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `Content-Type: application/json` | 有 JSON 请求体时必填 | 请求体格式                                                            |
| `Accept: application/json`       | 否                   | REST 请求推荐设置                                                     |
| `X-Trace-Id`                     | 否                   | `1`-`128` 个字母、数字、`.`、`_`、`:`、`-`；非法或缺失时服务生成 UUID |
| `Last-Event-ID`                  | SSE 重连时推荐       | 最近一次收到的 `eventID`，用于有限历史重放                            |

所有响应都会返回 `X-Trace-Id`。浏览器 POC 默认允许 `http://127.0.0.1:5173` 和 `http://localhost:5173`，可通过 `startHeadlessServer({ corsOrigins })` 覆盖。

### 2.2 REST 成功响应

所有 `/api/experimental/headless` REST 成功响应均为：

```json
{
  "data": {},
  "meta": { "protocolVersion": "headless.v1", "traceId": "trace_001" }
}
```

`data` 按接口不同返回对象、数组或 `null`；`meta.traceId` 与响应头 `X-Trace-Id` 一致。页面应只依赖 `data` 和 `meta`，不要读取服务内部对象。

### 2.3 REST 错误响应

```json
{
  "errorCode": "HEADLESS_SESSION_NOT_FOUND",
  "message": "Session 不存在",
  "traceId": "trace_002",
  "meta": { "protocolVersion": "headless.v1", "traceId": "trace_002" }
}
```

错误响应不得包含堆栈、绝对路径、凭据、环境变量或完整上游响应。页面应优先按 HTTP 状态码和 `errorCode` 分支处理，未知错误码保持通用错误展示。

## 3. 接口总览

| Method         | Path                                                          | 用途                             |
| -------------- | ------------------------------------------------------------- | -------------------------------- |
| `GET`          | `/health/live`、`/health/ready`                               | 存活和就绪探针                   |
| `GET`          | `/api/experimental/headless/capabilities`                     | 能力发现                         |
| `GET` / `PUT`  | `/api/experimental/headless/model`                            | 读取/保存安全模型配置            |
| `POST`         | `/api/experimental/headless/model/probe`                      | 文本和 Function Calling 能力探测 |
| `POST` / `GET` | `/api/experimental/headless/session`                          | 创建/列出会话                    |
| `GET`          | `/api/experimental/headless/session/:sessionID/state`         | 会话恢复快照                     |
| `POST`         | `/api/experimental/headless/session/:sessionID/prompt`        | 提交 Prompt                      |
| `POST`         | `/api/experimental/headless/session/:sessionID/cancel`        | 取消当前运行                     |
| `GET`          | `/api/experimental/headless/session/:sessionID/events`        | SSE 运行事件流                   |
| `GET` / `POST` | `/api/experimental/headless/session/:sessionID/permission...` | 权限查询和审批                   |
| `GET` / `POST` | `/api/experimental/headless/session/:sessionID/question...`   | Question 查询、回答和取消        |
| `GET` / `POST` | `/api/experimental/headless/skills...`                        | Skill 列表、注册、校验、激活     |

## 4. 能力发现

### `GET /api/experimental/headless/capabilities`

无请求体。响应示例：

```json
{
  "data": {
    "protocolVersion": "headless.v1",
    "transport": { "http": "json", "events": "sse" },
    "features": [
      "model",
      "session",
      "prompt",
      "permission",
      "question",
      "context_compaction",
      "project_context",
      "skill"
    ],
    "eventTypes": [
      "assistant.text",
      "tool.request",
      "tool.result",
      "permission.requested",
      "question.request",
      "session.completed"
    ]
  },
  "meta": { "protocolVersion": "headless.v1", "traceId": "trace_001" }
}
```

`eventTypes` 是服务可能发送的事件清单；页面遇到清单之外的事件必须忽略或以通用时间线展示。

## 5. 模型配置与探测

### `GET /model`

返回 `data: null` 或安全模型配置：

```json
{
  "data": {
    "baseUrl": "https://model.example.com/v1",
    "model": "coding-model",
    "credentialConfigured": true,
    "credentialRef": "env:HEADLESS_MODEL_KEY"
  },
  "meta": { "protocolVersion": "headless.v1", "traceId": "trace_001" }
}
```

### `PUT /model`

请求体：`baseUrl`、`model` 必填；`credential` 和 `credentialRef` 可选。凭据只写入服务端配置，不会出现在响应、事件或日志中。

```bash
curl -X PUT 'http://127.0.0.1:4097/api/experimental/headless/model' \
  -H 'Content-Type: application/json' \
  -H 'X-Trace-Id: model_update_001' \
  -d '{"baseUrl":"https://model.example.com/v1","model":"coding-model","credential":"<secret>"}'
```

### `POST /model/probe`

请求体 `{"mode":"text"|"function_calling"|"both"}`，省略时为 `both`。响应只返回：

```json
{
  "data": { "text": "pass", "functionCalling": "pass" },
  "meta": { "protocolVersion": "headless.v1", "traceId": "trace_002" }
}
```

## 6. Session 与 Prompt

### 创建与列表

`POST /session` 请求体：

```json
{ "directory": "/workspace/project" }
```

成功返回 `data: {"id","directory","status"}`；状态为 `idle`、`running`、`completed`、`failed` 或 `cancelled`。`GET /session` 返回同一安全视图的数组。

### `POST /session/:sessionID/prompt`

请求体：`{"text":"请读取 README.md"}`。成功只表示已接受异步运行：

```json
{ "data": { "status": "accepted" }, "meta": { "protocolVersion": "headless.v1", "traceId": "prompt_001" } }
```

模型文本、工具调用、权限、Question 和终态通过 SSE 事件返回，不在此响应中同步返回。

### `POST /session/:sessionID/cancel`

无请求体。成功返回 `data.status = "cancelled"`；页面仍应等待 `session.cancelled` 事件或重新读取状态快照。

## 7. 状态快照与恢复

### `GET /session/:sessionID/state`

响应 `data`：

```json
{
  "session": { "id": "session_001", "directory": "/workspace/project", "status": "running" },
  "pendingPermissions": [],
  "pendingQuestions": [],
  "lastSequence": 4
}
```

`pendingPermissions` 和 `pendingQuestions` 都是安全视图；`lastSequence` 是该会话事件历史中最后一个序号。会话不存在返回 `404 HEADLESS_SESSION_NOT_FOUND`，不得视为空快照。

恢复流程：先读取快照，再用最近保存的 `eventID` 建立 SSE；如果没有保存的 ID，可使用快照的 `lastSequence` 作为本地时间线起点。

## 8. SSE 事件协议

### `GET /session/:sessionID/events`

响应头：`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-store`、`Connection: keep-alive`。服务先发送连接注释，随后发送：

```text
event: assistant.text
id: event_004
data: {"eventID":"event_004","runID":"run_001","sessionID":"session_001","type":"assistant.text","sequence":4,"occurredAt":"2026-11-20T03:00:00.000Z","data":{"content":"完成"}}

```

事件身份字段：`eventID`（单个事件）、`runID`（一次 Prompt）、`sessionID`（会话）、`sequence`（会话内单调递增）、`occurredAt`（ISO 时间）；`data` 是可选安全业务对象。SSE `event` 等于 `type`，SSE `id` 等于 `eventID`。

常见事件：

| 事件                                          | 主要数据                                    | 页面动作           |
| --------------------------------------------- | ------------------------------------------- | ------------------ |
| `assistant.text`                              | `content`                                   | 追加模型文本       |
| `tool.request`                                | `toolCallID`、`action`、`resource`、`input` | 展示工具调用       |
| `permission.requested`                        | 脱敏后的 `action`、`resource`、`reason`     | 刷新权限列表       |
| `tool.result`                                 | `toolCallID`、`ok`、脱敏 `output`           | 展示工具结果       |
| `question.request`                            | `requestID`、`toolCallID`、`questions`      | 刷新 Question 列表 |
| `question.result` / `question.cancelled`      | 请求 ID                                     | 更新 Question 状态 |
| `context.compaction.started/completed/failed` | 压缩状态和统计                              | 更新上下文状态     |
| `context.project.loaded`                      | 脱敏来源摘要                                | 展示项目上下文来源 |
| `skill.activated` / `skill.failed`            | Skill 摘要或错误码                          | 更新 Skill 状态    |
| `session.completed/failed/cancelled`          | 终态信息                                    | 结束或刷新运行     |

### 8.1 断线重连

自定义客户端必须保存最近的 `id`，重连时发送：

```bash
curl -N 'http://127.0.0.1:4097/api/experimental/headless/session/session_001/events' \
  -H 'Last-Event-ID: event_004'
```

服务端为每个会话保留有限数量的最近事件。可找到游标时只重放其后的事件，再推送新事件；游标过旧或未知时会尽可能发送当前保留历史。历史不完整时，以状态快照为权威来源，不应依赖事件流单独恢复权限或 Question。

## 9. 权限与 Question

### 权限

- `GET /session/:sessionID/permission`：返回 pending 权限数组。
- `POST /session/:sessionID/permission/:requestID/reply`：请求体 `{"decision":"allow_once"|"allow_always"|"deny"}`。
- 重复回复已完成请求必须得到幂等结果或稳定 `HEADLESS_PERMISSION_NOT_FOUND`，不得重复执行工具。

### Question

- `GET /session/:sessionID/question`：返回 pending Question。
- `POST /session/:sessionID/question/:requestID/reply`：请求体 `{"answers":[["选项 A"]]}`。
- `POST /session/:sessionID/question/:requestID/cancel`：取消，不伪造答案。
- 答案必须符合 Question 的数量、选项和单选/多选约束。

## 10. Skill 接口

`GET /skills`、`GET /skills/:skillID`、`POST /skills/register`、`POST /skills/refresh`、`POST /skills/validate` 和 `POST /skills/:skillID/activate` 用于发现、注册、校验和显式激活 Skill。Skill 响应只返回稳定 ID、名称、描述、摘要、文件清单、状态和诊断，不返回宿主绝对路径或凭据。

## 11. 健康检查

- `GET /health/live` 返回 `{"service":"headless-server","status":"ok"}`。
- `GET /health/ready` 返回 `{"service":"headless-server","status":"ready"}`。

健康检查不使用 Headless REST Envelope，但仍返回 `X-Trace-Id`；它们不创建会话、不执行模型或工具。

## 12. 安全与可观测性

- 模型凭据只存在于服务端配置，禁止进入 `data`、事件、错误消息和日志。
- 工具资源、输入、输出和 Skill 诊断必须经过脱敏；页面只能看到安全视图。
- `directory` 必须经过 Core 的目录校验；工具不能越出会话目录。
- POC 默认绑定 `127.0.0.1`，未实现身份认证、租户隔离和生产级限流；生产接入必须由网关/宿主提供 TLS、认证、授权、CORS 白名单和审计。
- `X-Trace-Id` 用于跨页面、Server 和 Core 日志关联；日志只记录错误码、会话 ID、事件 ID、run ID 和 trace ID 等安全标识。

## 13. 常见错误码

| 错误码                             | HTTP | 说明                    |
| ---------------------------------- | ---: | ----------------------- |
| `HEADLESS_INVALID_REQUEST`         |  400 | 请求体或字段无效        |
| `HEADLESS_INVALID_DIRECTORY`       |  400 | 工作目录不存在或不可用  |
| `HEADLESS_SESSION_NOT_FOUND`       |  404 | 会话不存在              |
| `HEADLESS_PERMISSION_NOT_FOUND`    |  404 | 权限请求不存在或已完成  |
| `HEADLESS_QUESTION_NOT_FOUND`      |  404 | Question 不存在或已完成 |
| `HEADLESS_METHOD_NOT_ALLOWED`      |  405 | HTTP 方法不支持         |
| `HEADLESS_SESSION_CANCEL_CONFLICT` |  409 | 会话当前状态不允许取消  |
| `HEADLESS_MODEL_AUTH_FAILED`       |  401 | 模型端点认证失败        |
| `HEADLESS_MODEL_PROBE_FAILED`      |  503 | 模型能力探测失败        |
| `HEADLESS_ROUTE_NOT_FOUND`         |  404 | 路径不存在              |

## 14. 最小页面接入示例

```ts
const capabilities = await fetch(`${baseUrl}/api/experimental/headless/capabilities`).then((r) => r.json())
const session = await fetch(`${baseUrl}/api/experimental/headless/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ directory: "/workspace/project" }),
}).then((r) => r.json())

const sessionID = session.data.id
const events = new EventSource(`${baseUrl}/api/experimental/headless/session/${sessionID}/events`)
events.addEventListener("assistant.text", (message) => {
  const event = JSON.parse(message.data)
  renderAssistantText(event.data.content)
})

await fetch(`${baseUrl}/api/experimental/headless/session/${sessionID}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "请读取 README.md" }),
})
```

完整字段以 `packages/protocol/src/groups/headless.ts` 和生成的 OpenAPI 文档为准；本文件中的示例只使用公开安全字段。
