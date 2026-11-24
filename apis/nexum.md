# Nexum Runtime API

本文是 Nexum Runtime 对外 API 的使用说明。协议模型的权威定义位于 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md)，服务端装配位于 [`packages/nexum-server`](../packages/nexum-server/README.md)。

本文档覆盖 Nexum Runtime 的模型、默认角色提示词、Session、Permission、Question、Skill 和事件路由；其中 Skill 管理路由归属 `Skill Registry` 模块，调用方是 Nexum Web UI 和 Session Agent。

### 对外 route 覆盖表

下表以 `packages/nexum-server/src/index.ts` 的路由分支为准。路径参数使用 `:name` 表示，文档中的 `{name}` 示例值必须进行 URL path 编码。

| 路由归属    | 对外端点                                                   | 文档章节                                                                 | 覆盖状态 |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Health      | `GET /health/live`、`GET /health/ready`                    | [Health 与 Capabilities](#health-与-capabilities)                        | 已覆盖   |
| Runtime     | `GET /api/nexum/capabilities`                              | [Health 与 Capabilities](#health-与-capabilities)                        | 已覆盖   |
| Model       | `GET /api/nexum/model`、`PUT /api/nexum/model`             | [Model 配置与 Probe](#model-配置与-probe)                                | 已覆盖   |
| Model       | `POST /api/nexum/model/probe`                              | [Model 配置与 Probe](#model-配置与-probe)                                | 已覆盖   |
| Role Prompt | `GET` / `PUT` / `DELETE /api/nexum/role-prompt`            | [默认角色提示词](#默认角色提示词)                                        | 已覆盖   |
| Session     | `GET` / `POST /api/nexum/session`                          | [Session 资源与状态](#session-资源与状态)                                | 已覆盖   |
| Session     | `PUT` / `DELETE /api/nexum/session/:sessionID`             | [Session 资源与状态](#session-资源与状态)；[Session 删除](#session-删除) | 已覆盖   |
| Session     | `GET /api/nexum/session/:sessionID/state`                  | [Session 资源与状态](#session-资源与状态)                                | 已覆盖   |
| Session     | `POST /api/nexum/session/:sessionID/prompt`                | [Session 运行端点](#session-运行端点)                                    | 已覆盖   |
| Session     | `GET /api/experimental/nexum/session/:sessionID/messages`  | [Session 对话历史](#session-对话历史)                                    | 已覆盖   |
| Session     | `POST /api/experimental/nexum/session/:sessionID/continue` | [实验性：继续运行](#实验性继续运行)                                      | 已覆盖   |
| Session     | `POST /api/nexum/session/:sessionID/cancel`                | [Session 运行端点](#session-运行端点)                                    | 已覆盖   |
| Session     | `GET /api/nexum/session/:sessionID/events`                 | [事件语义](#事件语义)                                                    | 已覆盖   |
| Permission  | `/api/nexum/permission...`                                 | [Permission 与策略](#permission-与策略)                                  | 待补齐   |
| Question    | `/api/nexum/session/:sessionID/question...`                | [Question 反问](#question-反问)                                          | 待补齐   |
| Skill       | `/api/nexum/skills...`                                     | [Skill 注册管理](#skill-注册管理)                                        | 已覆盖   |

## 协议约定

| 项目      | 约定                                                                      |
| --------- | ------------------------------------------------------------------------- |
| 协议版本  | `nexum.runtime.v1`                                                        |
| HTTP 前缀 | `/api/nexum`；继续运行实验性接口使用 `/api/experimental/nexum`            |
| 健康检查  | `/health/live`、`/health/ready`                                           |
| 响应格式  | JSON Envelope：`data` + `meta.protocolVersion` + `meta.traceId`           |
| 事件传输  | SSE；事件包含 `eventID`、`runID`、`sessionID`、`sequence` 和 `occurredAt` |

## 资源与操作

| 方法                      | 路径                                                  | 用途                                                     |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `GET`                     | `/api/nexum/capabilities`                             | 能力发现和事件类型发现                                   |
| `GET` / `PUT`             | `/api/nexum/model`                                    | 读取和保存模型配置                                       |
| `POST`                    | `/api/nexum/model/probe`                              | 探测模型能力                                             |
| `GET` / `PUT` / `DELETE`  | `/api/nexum/role-prompt`                              | 读取、保存和恢复默认角色提示词                           |
| `GET` / `POST`            | `/api/nexum/session`                                  | 列出或创建 Session                                       |
| `PUT` / `DELETE`          | `/api/nexum/session/:sessionID`                       | 更新或删除 Session                                       |
| `GET`                     | `/api/nexum/session/:sessionID/state`                 | 获取恢复状态                                             |
| `GET`                     | `/api/experimental/nexum/session/:sessionID/messages` | 分页读取 canonical 对话历史；实验性接口                  |
| `POST`                    | `/api/nexum/session/:sessionID/prompt`                | 提交长任务 Prompt                                        |
| `POST`                    | `/api/experimental/nexum/session/:sessionID/continue` | 从既有 User/Tool 上下文继续运行；实验性接口              |
| `POST`                    | `/api/nexum/session/:sessionID/cancel`                | 取消当前运行                                             |
| `GET`                     | `/api/nexum/session/:sessionID/events`                | 订阅 SSE 事件流                                          |
| `GET` / `POST`            | `/api/nexum/session/:sessionID/permission...`         | 查询和回复权限请求                                       |
| `GET` / `POST`            | `/api/nexum/session/:sessionID/question...`           | 查询、回答和取消结构化反问                               |
| `GET` / `POST` / `DELETE` | `/api/nexum/skills...`                                | Skill 列表、详情、按地址注册、刷新、校验、取消注册和激活 |

## Health 与 Capabilities

### Health

| 方法  | URL             | 成功响应                                             | 失败行为                                   |
| ----- | --------------- | ---------------------------------------------------- | ------------------------------------------ |
| `GET` | `/health/live`  | `200`，`{"service":"nexum-server","status":"ok"}`    | 非 GET 返回 `405 NEXUM_METHOD_NOT_ALLOWED` |
| `GET` | `/health/ready` | `200`，`{"service":"nexum-server","status":"ready"}` | 非 GET 返回 `405 NEXUM_METHOD_NOT_ALLOWED` |

Health 响应是轻量 JSON，不包含 `meta`，但会带 `X-Trace-Id`；请求体、Cookie 和认证信息均不适用。

### Capabilities

`GET /api/nexum/capabilities` 返回当前 Protocol 版本、传输方式、feature 名称、事件类型和 capability 操作矩阵。当前传输为 JSON + SSE；调用方应以 `status` 和 `operations` 判断能力是否可用，不应把未配置的可选 Runtime 当作已启用。

下面示例为缩略响应；实际 `features` 和 `eventTypes` 数组以服务返回为准，`capabilities` 返回完整矩阵。

```json
{
  "data": {
    "protocolVersion": "nexum.runtime.v1",
    "transport": { "http": "json", "events": "sse" },
    "features": ["model", "session", "prompt", "permission", "question", "skill"],
    "eventTypes": ["assistant.text", "session.completed", "run.settled"],
    "capabilities": [
      {
        "id": "session",
        "version": "1",
        "status": "enabled",
        "operations": ["create", "list", "get", "update", "delete", "continue"]
      }
    ]
  },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_capabilities_001" }
}
```

响应失败时使用统一 `NEXUM_METHOD_NOT_ALLOWED` 错误结构；Cookies 不适用。

```bash
curl --request GET 'http://127.0.0.1:4097/api/nexum/capabilities' \
  --header 'Accept: application/json' \
  --header 'X-Trace-Id: trace_capabilities_001'
```

## Model 配置与 Probe

### `GET /api/nexum/model`

读取安全模型配置。成功 `200` 的 `data` 为 `null` 或 `{baseUrl, model, credentialConfigured, credentialRef?}`；credential 原文永不返回。未配置 Store 返回 `503 NEXUM_MODEL_CONFIG_NOT_CONFIGURED`。

### `PUT /api/nexum/model`

请求体：

```json
{
  "baseUrl": "https://model.example.test/v1",
  "model": "example-model",
  "credential": "secret-value",
  "credentialRef": "env:MODEL_TOKEN"
}
```

`baseUrl`、`model` 必填字符串；`credential` 和 `credentialRef` 可选但必须是字符串。成功返回 `200` 和安全配置；字段无效返回 `400 NEXUM_INVALID_MODEL_CONFIG`，Store 未配置返回 `503 NEXUM_MODEL_CONFIG_NOT_CONFIGURED`，保存失败返回 `500 NEXUM_MODEL_CONFIG_UPDATE_FAILED`。更新失败时保留旧配置。

### `POST /api/nexum/model/probe`

请求体可省略，或使用 `{ "mode": "text" | "function_calling" | "both" }`；默认 `both`。成功 `200` 返回：

```json
{
  "data": { "text": "pass", "functionCalling": "skipped" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_probe_001" }
}
```

错误：`400 NEXUM_INVALID_MODEL_PROBE` 表示 mode 非法；`401 NEXUM_MODEL_AUTH_FAILED` 表示上游认证失败；`503 NEXUM_MODEL_PROBE_NOT_CONFIGURED` 或 `NEXUM_MODEL_PROBE_FAILED` 表示 Probe 未配置或上游不可用。Probe 只返回能力状态，不返回模型内容或凭据。

请求 Header 仅使用可选 `X-Trace-Id`；Cookie 不适用。

```bash
curl --request PUT 'http://127.0.0.1:4097/api/nexum/model' \
  --header 'Content-Type: application/json' \
  --data '{"baseUrl":"https://model.example.test/v1","model":"example-model","credentialRef":"env:MODEL_TOKEN"}'

curl --request POST 'http://127.0.0.1:4097/api/nexum/model/probe' \
  --header 'Content-Type: application/json' \
  --data '{"mode":"both"}'
```

## Session 资源与状态

### Collection：`GET` / `POST /api/nexum/session`

#### `GET` 列出 Session

无 query 参数、request body 或 Cookie。成功 `200` 返回：

```json
{
  "data": [
    {
      "id": "session_001",
      "name": "project",
      "directory": "/absolute/project",
      "status": "idle",
      "createdAt": "2026-11-24T00:00:00.000Z",
      "updatedAt": "2026-11-24T00:00:00.000Z"
    }
  ],
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_sessions_001" }
}
```

列表用于页面选择和恢复，不返回消息历史；排序由 Session Store 按 `updatedAt` 倒序处理。

#### `POST` 创建 Session

请求体字段：

| 字段        | 类型   | 必填 | 说明                                                          |
| ----------- | ------ | ---- | ------------------------------------------------------------- |
| `directory` | string | 是   | 非空绝对工作目录；由当前 Runtime 的目录校验器确认存在且可读写 |
| `name`      | string | 否   | 展示名称；省略时使用目录名                                    |

成功 `200` 返回新 Session，初始 `status` 为 `idle`。参数结构错误返回 `400 NEXUM_INVALID_REQUEST`；目录校验失败返回 `400 NEXUM_INVALID_DIRECTORY`；Store 失败返回 `500 NEXUM_SESSION_CREATE_FAILED`。

```bash
curl --request POST 'http://127.0.0.1:4097/api/nexum/session' \
  --header 'Content-Type: application/json' \
  --header 'X-Trace-Id: trace_create_001' \
  --data '{"directory":"/absolute/project","name":"project"}'
```

### Resource：`PUT` / `DELETE /api/nexum/session/{sessionID}`

#### `PUT` 更新展示名称

请求体只接受 `{ "name": "新名称" }`。成功 `200` 返回更新后的 Session；name 缺失或不是字符串、或为空字符串返回 `400 NEXUM_INVALID_REQUEST`；Session 不存在返回 `404 NEXUM_SESSION_NOT_FOUND`；保存失败返回 `500 NEXUM_SESSION_UPDATE_FAILED`。

#### `DELETE` 删除 Session

DELETE 请求体为空，完整契约见 [Session 删除](#session-删除)。删除不会移除工作目录或模型配置。

### State：`GET /api/nexum/session/{sessionID}/state`

成功 `200` 返回 `session`、`canContinue`、`pendingPermissions`、`pendingQuestions` 和 `lastSequence`。Session 不存在返回 `404 NEXUM_SESSION_NOT_FOUND`。该快照用于页面恢复，不替代 messages 历史或 SSE 事件。

```json
{
  "data": {
    "session": {
      "id": "session_001",
      "name": "project",
      "directory": "/absolute/project",
      "status": "idle",
      "createdAt": "...",
      "updatedAt": "..."
    },
    "canContinue": true,
    "pendingPermissions": [],
    "pendingQuestions": [],
    "lastSequence": 42
  },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_state_001" }
}
```

所有 JSON Session 请求使用统一 Envelope；`X-Trace-Id` 可选，非法或缺失时由服务生成；请求 Cookie 不适用。

## Session 运行端点

本节记录 Prompt 和 Cancel 的请求、受理和错误语义；历史、Continue、SSE 的完整恢复语义见对应章节。

### `POST /api/nexum/session/{sessionID}/prompt`

请求 Header 可带 `Content-Type: application/json` 和 `X-Trace-Id`；Cookie 不适用。请求体为 `{ "text": "非空 Prompt" }`，服务在受理边界拒绝空白文本。

成功 `200` 只表示 admission 已接受，运行在后台继续：

```json
{
  "data": { "status": "accepted" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_prompt_001" }
}
```

错误：

| HTTP 状态码 | `errorCode`                    | 触发条件                              |
| ----------- | ------------------------------ | ------------------------------------- |
| `400`       | `NEXUM_INVALID_REQUEST`        | body 不是对象或 `text` 不是非空字符串 |
| `404`       | `NEXUM_SESSION_NOT_FOUND`      | Session 不存在                        |
| `409`       | `NEXUM_SESSION_RUN_CONFLICT`   | Session 已运行或 admission 竞争失败   |
| `500`       | `NEXUM_INTERNAL_ERROR`         | admission 发生未分类内部失败          |
| `503`       | `NEXUM_RUNTIME_NOT_CONFIGURED` | Coding Loop 未配置                    |

调用方收到 `accepted` 后应先打开/保持 SSE，再使用 `run.settled` 和 Session state 判断最终状态，不要等待 HTTP 请求本身变成长轮询。

```bash
curl --request POST 'http://127.0.0.1:4097/api/nexum/session/session_001/prompt' \
  --header 'Content-Type: application/json' \
  --header 'X-Trace-Id: trace_prompt_001' \
  --data '{"text":"请检查项目状态"}'
```

### `POST /api/nexum/session/{sessionID}/cancel`

请求体为空，`Content-Type` 不适用；可带 `X-Trace-Id`，Cookie 不适用。成功返回：

```json
{
  "data": { "status": "cancelled" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_cancel_001" }
}
```

Session 不存在返回 `404 NEXUM_SESSION_NOT_FOUND`；取消过程中状态不允许转换返回 `409 NEXUM_SESSION_CANCEL_CONFLICT`。Cancel 会中止活动 Coding Loop 和待处理权限，但不删除消息历史、事件或 Session。

```bash
curl --request POST 'http://127.0.0.1:4097/api/nexum/session/session_001/cancel' \
  --header 'X-Trace-Id: trace_cancel_001'
```

## 默认角色提示词

默认角色提示词是独立于模型凭据和 Session 消息历史的全局配置。默认本地 Runtime 将它持久化到 `<dataDirectory>/role-prompt.json`，也可通过 `NEXUM_ROLE_PROMPT_FILE` 指定文件。文件采用原子替换写入并使用 `0600` 权限。

| 方法     | URL                      | 请求体                 | 成功响应                                        |
| -------- | ------------------------ | ---------------------- | ----------------------------------------------- |
| `GET`    | `/api/nexum/role-prompt` | 不适用                 | `200`，`data` 为 `{prompt, source, updatedAt?}` |
| `PUT`    | `/api/nexum/role-prompt` | `{prompt}`，非空字符串 | `200`，返回保存后的配置                         |
| `DELETE` | `/api/nexum/role-prompt` | 不适用                 | `200`，恢复内置默认配置                         |

示例：

```http
PUT /api/nexum/role-prompt
Content-Type: application/json

{"prompt":"思考和回答都使用中文。"}
```

每次模型调用前，Nexum 将当前提示词原文作为 `system` 消息注入，来源标识固定为 `runtime:default-role`。该消息不会写入 Session 历史；resume、continue 和 compaction 后会重新读取最新配置。Nexum 不翻译、过滤或改写模型的 reasoning、tool 参数和文本输出，Agent 也不能通过工具修改该全局配置。

## Session 对话历史

### 接口概览

`GET /api/experimental/nexum/session/:sessionID/messages` 从 `MessageStore` 读取 Session 的 canonical 消息历史，默认返回最新一页。它服务于页面恢复和向上滚动，不返回事件日志，也不返回默认角色提示词、Skill 原文、项目上下文原文、工具定义或模型凭据。实验性接口可能变化，不提供兼容别名。

| 项目     | 内容                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 调用方   | Nexum Web UI 或需要恢复对话的 Runtime 客户端                                                                 |
| 前置条件 | `sessionID` 对应现存 Session                                                                                 |
| 分页     | `limit` 为 1-100 的整数，默认 50；`before` 为非负消息索引，返回其之前的一页；继续翻页时带上上页的 `snapshot` |
| 排序     | 按 canonical 消息写入顺序升序返回；`index` 是当前历史快照中的零基索引                                        |
| 脱敏     | 文本和结构化工具输入在响应边界脱敏；内部模型历史不被修改                                                     |
| 认证     | 当前认证约定待确认；服务实现未校验认证信息                                                                   |

### 请求定义

#### Method and URL

```http
GET http://127.0.0.1:4097/api/experimental/nexum/session/{sessionID}/messages?limit=50&before=100
```

#### Path parameters

| 参数名        | 类型   | 必填 | 格式/范围                 | 示例          | 说明         |
| ------------- | ------ | ---- | ------------------------- | ------------- | ------------ |
| `{sessionID}` | string | 是   | URL 编码后的 Session 标识 | `session_001` | 目标 Session |

#### Query parameters

| 参数名     | 类型    | 必填       | 默认值   | 范围                    | 说明                                                    |
| ---------- | ------- | ---------- | -------- | ----------------------- | ------------------------------------------------------- |
| `limit`    | integer | 否         | `50`     | `1-100`                 | 本页最多返回的消息数                                    |
| `before`   | integer | 否         | 历史长度 | `>=0` 且不超过历史长度  | 返回索引小于该值的最近一页；使用上次响应的 `nextBefore` |
| `snapshot` | string  | 翻页时必填 | 无       | 上页响应的 `snapshotID` | 校验分页期间 canonical 历史未被重写                     |

#### Request headers and cookies

`X-Trace-Id` 可选，格式为 1-128 位字母、数字、`.`、`_`、`:` 或 `-`；缺失或非法时服务生成新的 trace ID。`Accept: application/json` 可选。请求 Cookie 不适用。

### 成功响应：`200 OK`

```json
{
  "data": {
    "messages": [
      {
        "index": 98,
        "message": { "role": "user", "content": "请检查项目状态" }
      },
      {
        "index": 99,
        "message": {
          "role": "system",
          "sourceID": "context:summary",
          "content": "Context summary:\n已完成项目检查"
        }
      }
    ],
    "total": 100,
    "hasMore": true,
    "nextBefore": 98,
    "snapshotID": "8d3f0f5c…"
  },
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_messages_001"
  }
}
```

| 字段路径                  | 类型    | 必有/可选 | 说明                                                            |
| ------------------------- | ------- | --------- | --------------------------------------------------------------- |
| `data.messages`           | array   | 必有      | 当前页消息，按 canonical 顺序升序排列                           |
| `data.messages[].index`   | integer | 必有      | 当前消息在历史快照中的零基索引                                  |
| `data.messages[].message` | object  | 必有      | `system`、`user`、`assistant` 或 `tool` 消息                    |
| `data.total`              | integer | 必有      | 当前历史快照的消息总数                                          |
| `data.hasMore`            | boolean | 必有      | 是否还有更早消息                                                |
| `data.nextBefore`         | integer | 可选      | 下一次请求使用的 `before`；没有更早消息时省略                   |
| `data.snapshotID`         | string  | 必有      | 当前 canonical 历史快照标识；向上翻页时原样作为 `snapshot` 传回 |
| `meta.protocolVersion`    | string  | 必有      | 固定为 `nexum.runtime.v1`                                       |
| `meta.traceId`            | string  | 必有      | 请求链路标识                                                    |

`assistant` 消息可包含 `content`、`reasoningContent` 和 `toolCalls`；`tool` 消息包含 `toolCallID` 和 `content`。压缩摘要以 `sourceID: context:summary` 的 `system` 消息返回。

### 错误响应

错误响应包含 `errorCode`、中文 `message`、`traceId` 和协议 `meta`；不会返回本地文件路径、异常堆栈或凭据。

| HTTP 状态码 | `errorCode`                      | 触发条件                                 | 调用方处理                                      |
| ----------- | -------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `400`       | `NEXUM_INVALID_REQUEST`          | `limit`、`before` 缺失格式错误或超出范围 | 修正分页参数后重试                              |
| `404`       | `NEXUM_SESSION_NOT_FOUND`        | Session 不存在                           | 清除本地 Session 选择并重新加载列表             |
| `409`       | `NEXUM_HISTORY_SNAPSHOT_EXPIRED` | 翻页期间历史被压缩或重写                 | 丢弃旧游标，从最新页重新加载                    |
| `405`       | `NEXUM_METHOD_NOT_ALLOWED`       | 使用非 GET 方法                          | 改用 GET                                        |
| `500`       | `NEXUM_INTERNAL_ERROR`           | MessageStore 不可读或服务内部失败        | 使用 `traceId` 排障，保留当前页面内容并稍后重试 |

### curl 示例

```bash
curl --get 'http://127.0.0.1:4097/api/experimental/nexum/session/session_001/messages' \
  --data-urlencode 'limit=50' \
  --header 'Accept: application/json' \
  --header 'X-Trace-Id: trace_messages_001'
```

使用上一页返回的游标查询更早消息：

```bash
curl --get 'http://127.0.0.1:4097/api/experimental/nexum/session/session_001/messages' \
  --data-urlencode 'before=98' \
  --data-urlencode 'limit=50'
```

## Session 删除

### 接口概览

`DELETE /api/nexum/session/:sessionID` 删除指定 Session 的持久化历史和运行记录，但保留工作目录与模型配置。服务按 `messageStore`、可选 `interactionStore`、`eventHub`、`sessionService` 的顺序删除；任一步依赖失败都会返回稳定的 `NEXUM_SESSION_DELETE_FAILED`，不会暴露内部错误文本。

| 项目     | 内容                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 接口用途 | 删除不再需要的 Nexum Session 及其消息、交互和事件记录                              |
| 调用方   | 已确认 Session 不再需要的 Runtime 客户端                                           |
| 前置条件 | `sessionID` 对应现存且当前不处于 `running` 状态的 Session                          |
| 权限要求 | 当前认证约定待确认；服务实现未校验认证信息                                         |
| 幂等性   | 重复删除不视为成功幂等：首次成功返回 `200`，之后返回 `404 NEXUM_SESSION_NOT_FOUND` |
| 数据保留 | 工作目录和模型配置不受影响                                                         |

### 请求定义

#### Method and URL

```http
DELETE http://127.0.0.1:4097/api/nexum/session/{sessionID}
```

| 项目         | 内容                                                                 |
| ------------ | -------------------------------------------------------------------- |
| Method       | `DELETE`                                                             |
| URL          | `/api/nexum/session/{sessionID}`；`sessionID` 必须进行 URL path 编码 |
| Content-Type | 不适用；请求体为空                                                   |
| Accept       | 可选；服务返回 JSON                                                  |

#### Path parameters

| 参数名        | 类型   | 必填 | 格式/范围                                         | 示例          | 说明           |
| ------------- | ------ | ---- | ------------------------------------------------- | ------------- | -------------- |
| `{sessionID}` | string | 是   | 已存在的 Session 标识；作为 URL path segment 传输 | `session_001` | 待删除 Session |

#### Query parameters

不适用。

#### Request headers

| Header          | 必填   | 类型/格式                                | 示例               | 用途                                              | 缺失或非法时                             |
| --------------- | ------ | ---------------------------------------- | ------------------ | ------------------------------------------------- | ---------------------------------------- |
| `X-Trace-Id`    | 否     | 1-128 位字母、数字、`.`、`_`、`:` 或 `-` | `trace_delete_001` | 排障关联；响应 Header 和响应体会返回同一 trace ID | 缺失或非法时生成新的 trace ID            |
| `Authorization` | 不适用 | —                                        | —                  | 当前接口未实现认证校验                            | 当前实现不会因缺失该 Header 返回认证错误 |

#### Request cookies

不适用。当前接口不读取或设置 Cookie。

#### requestBody

请求体不适用，必须为空；不得发送 JSON 删除参数。

### 响应定义

#### Response headers

所有 JSON 响应包含以下 Header：

| Header          | 示例                             | 用途                    |
| --------------- | -------------------------------- | ----------------------- |
| `Content-Type`  | `application/json;charset=utf-8` | JSON 响应媒体类型       |
| `Cache-Control` | `no-store`                       | 禁止缓存删除结果        |
| `Vary`          | `origin`                         | CORS 响应变化标识       |
| `X-Trace-Id`    | `trace_delete_001`               | 与响应体 `traceId` 一致 |

响应 Cookie：不适用。

#### 成功响应：`200 OK`

```json
{
  "data": {
    "id": "session_001",
    "deleted": true
  },
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_delete_001"
  }
}
```

| 字段路径               | 类型            | 必有/可选 | 示例               | 说明                        |
| ---------------------- | --------------- | --------- | ------------------ | --------------------------- |
| `data.id`              | string          | 必有      | `session_001`      | 被删除的 Session ID         |
| `data.deleted`         | boolean literal | 必有      | `true`             | 固定为 `true`，表示删除成功 |
| `meta.protocolVersion` | string          | 必有      | `nexum.runtime.v1` | 协议版本                    |
| `meta.traceId`         | string          | 必有      | `trace_delete_001` | 请求链路标识                |

#### 错误响应

错误响应沿用统一错误结构，包含 `errorCode`、`message`、`traceId` 和 `meta`；`message` 不包含内部 Store 或异常文本。

| HTTP 状态码 | `errorCode`                   | 触发条件                                               | 调用方处理                              |
| ----------- | ----------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `404`       | `NEXUM_SESSION_NOT_FOUND`     | Session 未知或已经成功删除后再次删除                   | 停止重试该 Session ID                   |
| `409`       | `NEXUM_SESSION_RUN_CONFLICT`  | Session 当前处于 `running`，或删除过程中检测到运行冲突 | 等待本轮运行结束后再发起删除            |
| `405`       | `NEXUM_METHOD_NOT_ALLOWED`    | 对该资源使用非 `PUT`/`DELETE` 方法                     | 改用支持的方法                          |
| `500`       | `NEXUM_SESSION_DELETE_FAILED` | Message、Interaction、Event 或 Session Store 删除失败  | 使用 `traceId` 排障；按服务恢复策略重试 |

`404` 示例：

```json
{
  "errorCode": "NEXUM_SESSION_NOT_FOUND",
  "message": "Session 不存在",
  "traceId": "trace_delete_002",
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_delete_002"
  }
}
```

`409` 示例：

```json
{
  "errorCode": "NEXUM_SESSION_RUN_CONFLICT",
  "message": "Session 当前正在运行，请先等待本轮完成后再删除",
  "traceId": "trace_delete_003",
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_delete_003"
  }
}
```

`500` 示例：

```json
{
  "errorCode": "NEXUM_SESSION_DELETE_FAILED",
  "message": "Session 删除失败",
  "traceId": "trace_delete_004",
  "meta": {
    "protocolVersion": "nexum.runtime.v1",
    "traceId": "trace_delete_004"
  }
}
```

### curl 示例

```bash
curl --request DELETE 'http://127.0.0.1:4097/api/nexum/session/session_001' \
  --header 'X-Trace-Id: trace_delete_001'
```

请求不携带 body、认证 Header 或 Cookie。成功响应的 HTTP Header 为 `Content-Type: application/json;charset=utf-8`、`Cache-Control: no-store`、`Vary: origin` 和 `X-Trace-Id: trace_delete_001`，响应体如下：

```json
{
  "data": { "id": "session_001", "deleted": true },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_delete_001" }
}
```

## Skill 注册管理

Nexum 以注册表中的地址为 Skill 来源。默认本地 Runtime 将注册源和安全状态持久化到 `<dataDirectory>/skills.json`；显式配置可通过 `NEXUM_SKILL_REGISTRY_FILE` 覆盖。取消注册只删除 Nexum 注册记录，不删除、移动或修改源目录。

Session Agent 使用内置 `skill_registry` 工具管理 Nexum 注册表，操作为 `list`、`detail`、`register`、`refresh`、`validate` 和 `unregister`。`register` 必须提供本地目录 `address`；工具不会使用 shell 搜索 Skill，也不会删除或修改源目录。注册、刷新和取消注册使用 `skill.manage` 权限边界，列表、详情和校验使用只读边界；默认角色提示词管理不作为 Agent 工具暴露。

### 通用约定

| 项目           | 约定                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| 权限           | 当前服务认证约定待确认；注册/刷新/取消注册由调用方的 Nexum 管理权限边界负责，服务端不读取 Cookie。 |
| `Content-Type` | 有 JSON body 的 POST 使用 `application/json`；GET/DELETE 请求体不适用。                            |
| `Accept`       | 可选，推荐 `application/json`。                                                                    |
| `X-Trace-Id`   | 可选，1-128 位安全字符；缺失或非法时服务生成新的 trace ID。                                        |
| Cookie         | 请求 Cookie 和响应 Cookie 均不适用。                                                               |
| 幂等性         | 同一规范化 address 重复注册不会创建重复记录；DELETE 重复执行返回 `404 NEXUM_SKILL_NOT_FOUND`。     |
| 地址安全       | 只接受本地目录；拒绝 HTTP(S)、路径遍历、源目录符号链接和 Skill 内符号链接。                        |

### 端点覆盖

| 方法     | URL                              | 请求体             | 成功响应                                 | 实际错误                                                     |
| -------- | -------------------------------- | ------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| `GET`    | `/api/nexum/skills`              | 不适用             | `200`，`data` 为 Skill 摘要数组          | `503 NEXUM_SKILL_REGISTRY_NOT_CONFIGURED`                    |
| `GET`    | `/api/nexum/skills/:id`          | 不适用             | `200`，`data` 为单个摘要                 | `404 NEXUM_SKILL_NOT_FOUND`                                  |
| `POST`   | `/api/nexum/skills/register`     | `{address}`        | `200`，`data` 为注册后的摘要             | `400 NEXUM_INVALID_REQUEST` 或 `NEXUM_SKILL_REGISTER_FAILED` |
| `POST`   | `/api/nexum/skills/refresh`      | `{id?}`            | `200`，`data` 为刷新后的数组             | `400 NEXUM_INVALID_REQUEST`                                  |
| `POST`   | `/api/nexum/skills/validate`     | `{id?}`            | `200`，`data.valid` 和摘要数组           | `400 NEXUM_INVALID_REQUEST`                                  |
| `DELETE` | `/api/nexum/skills/:id`          | 不适用             | `200`，`data.deleted=true`               | `404 NEXUM_SKILL_NOT_FOUND`                                  |
| `POST`   | `/api/nexum/skills/:id/activate` | `{sessionID,text}` | `200`，`data` 为 Skill prompt attachment | `404`/`409` Skill 或 Session 错误                            |

成功响应统一使用：

```json
{
  "data": {
    "id": "metric-view-lifecycle",
    "status": "ready",
    "sourceType": "local-directory",
    "digest": "<sha256>",
    "fileCount": 3,
    "files": ["SKILL.md", "references/contract.md", "scripts/check.py"],
    "diagnostics": []
  },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_skill_001" }
}
```

错误响应统一包含 `errorCode`、中文 `message`、`traceId` 和协议 `meta`；不会返回本地绝对路径、环境变量、凭据或原始文件内容。响应 Cookie：不适用。

### 按地址注册

```http
POST http://127.0.0.1:4097/api/nexum/skills/register
Content-Type: application/json

{"address":"/workspace/skills/metric-view-lifecycle"}
```

同一规范化地址重复注册是幂等的。地址必须是本地目录，目录内必须包含合法的 `SKILL.md`；第一阶段不支持 HTTP(S) 下载地址。响应中的 Skill 摘要不会返回宿主绝对路径、凭据或源文件内容。

### 刷新与校验

```http
POST /api/nexum/skills/refresh
Content-Type: application/json

{"id":"metric-view-lifecycle"}
```

`id` 可省略以刷新全部已注册来源。校验接口使用同样的可选 `id`：

```http
POST /api/nexum/skills/validate
Content-Type: application/json

{"id":"metric-view-lifecycle"}
```

### 取消注册

```http
DELETE http://127.0.0.1:4097/api/nexum/skills/metric-view-lifecycle
```

成功返回 `200`，数据为 `{ "id": "metric-view-lifecycle", "deleted": true }`。源目录仍保留；如果源目录被移动或损坏，注册表会保留 `invalid` 状态供用户刷新、修复或取消注册。

### Skill registry 事件

注册、刷新、校验和取消注册可产生 `skill.updated` 事件，数据只包含 Skill ID、变更类型和安全状态，不包含绝对路径或文件正文。已有 `skill.activated` 和 `skill.failed` 事件保持不变。

## 事件语义

Core 只产生运行事实，Server 将事实编码为协议事件，应用层决定如何呈现。常用事件包括：

- `assistant.thinking`、`assistant.reasoning`、`assistant.text`：模型输出及思考状态；
- `tool.request`、`tool.result`：工具调用和工具结果；
- `permission.requested`：需要用户确认的权限请求；
- `question.request`、`question.result`、`question.cancelled`：结构化反问生命周期；
- `context.compaction.started`、`context.compaction.completed`、`context.compaction.failed`：上下文压缩；
- `skill.activated`、`skill.failed`：Skill 生命周期；
- `skill.updated`：Skill 注册状态发生变化；
- `model.attempt`、`model.retry`：模型尝试与自动重试；
- `session.completed`、`session.failed`、`session.cancelled`：Session 终态。
- `run.settled`：一次运行最终结算，`result` 为 `completed`、`failed` 或 `cancelled`。

因此，UI 不应通过解析模型文本来猜测是否需要反问或展示权限卡片，而应消费对应的协议事件。

Session state 快照还包含 `canContinue`，表示当前持久化历史是否以可继续的 `user` 或 `tool` 消息结尾。应用层恢复页面时应优先使用该字段决定是否展示 Continue 操作；恢复对话正文应使用上面的消息历史接口，不应从事件窗口反推完整消息。

事件流支持可选查询参数 `afterSequence`，用于从严格大于该值的 `sequence` 开始回放：

```http
GET /api/nexum/session/{sessionID}/events?afterSequence=42
Accept: text/event-stream
```

`afterSequence` 是非负整数；格式非法时返回 `400 NEXUM_INVALID_REQUEST`。如果同时提供 `Last-Event-ID`（或兼容的 `after` query），服务会将事件 ID 对应的序号与 `afterSequence` 取较大值作为下界，仍只返回严格更大的事件。断线重连应继续使用 `Last-Event-ID`，首次加载可使用 Session state 的 `lastSequence`。历史消息和事件流来自两个持久化读模型，页面应以消息历史恢复对话正文、以事件流恢复实时状态；在运行并发写入期间，实时事件仍是最终状态来源。

### SSE 请求与响应

请求只支持 `GET`，`Accept: text/event-stream` 和 `X-Trace-Id` 可选，Cookie 不适用。Session 不存在返回 `404 NEXUM_SESSION_NOT_FOUND`；`afterSequence` 不是非负整数返回 `400 NEXUM_INVALID_REQUEST`；其他方法返回 `405 NEXUM_METHOD_NOT_ALLOWED`。

成功响应使用 `200 OK`、`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-store` 和 `Connection: keep-alive`。连接建立后先发送注释帧：

```text
: nexum-events-connected

```

每个事件包含 SSE `event`、`id` 和单行 JSON `data`：

```text
event: assistant.text
id: event_001
data: {"eventID":"event_001","runID":"run_001","type":"assistant.text","sessionID":"session_001","sequence":12,"occurredAt":"2026-11-24T00:00:00.000Z","data":{"content":"增量文本"}}

```

`id` 使用事件的 `eventID`；兼容事件没有 event ID 时，Server 使用 `sessionID:sequence` 生成。客户端必须按 Session 保存最后 event ID/sequence，并在重连时去重。

```bash
curl --no-buffer --request GET \
  'http://127.0.0.1:4097/api/nexum/session/session_001/events?afterSequence=42' \
  --header 'Accept: text/event-stream' \
  --header 'Last-Event-ID: event_041' \
  --header 'X-Trace-Id: trace_events_001'
```

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

| HTTP 状态码 | `errorCode`                                               | 触发条件                         | 调用方处理                |
| ----------- | --------------------------------------------------------- | -------------------------------- | ------------------------- |
| `400`       | `NEXUM_INVALID_REQUEST`                                   | 请求体不是 JSON 对象             | 修正为 `{}` 后重试        |
| `404`       | `NEXUM_SESSION_NOT_FOUND`                                 | Session 不存在                   | 不要继续重试相同 ID       |
| `409`       | `NEXUM_SESSION_RUN_CONFLICT`                              | Session 已在运行                 | 等待 `run.settled` 后重试 |
| `409`       | `NEXUM_SESSION_NOT_CONTINUABLE`                           | 没有可继续的 User/Tool 上下文    | 提交新的 Prompt           |
| `503`       | `NEXUM_CONTINUE_NOT_CONFIGURED` / `NEXUM_CONTINUE_FAILED` | Runtime 未配置或 Continue 不可用 | 按服务状态稍后重试        |

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
