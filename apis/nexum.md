# Nexum Runtime API

本文是 Nexum Runtime 对外 API 的使用说明。协议模型的权威定义位于 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md)，服务端装配位于 [`packages/nexum-server`](../packages/nexum-server/README.md)。

本文档覆盖 Nexum Runtime 的模型、默认角色提示词、Session、Permission、Question、Skill 和事件路由；其中 Skill 管理路由归属 `Skill Registry` 模块，调用方是 Nexum Web UI 和 Session Agent。

### 对外 route 覆盖表

| 路由归属 | 对外端点 | 文档章节 | 覆盖状态 |
| --- | --- | --- | --- |
| Nexum Runtime | `GET /api/nexum/skills`、`GET /api/nexum/skills/:id` | [Skill 注册管理](#skill-注册管理) | 已覆盖 |
| Nexum Runtime | `POST /api/nexum/skills/register`、`POST /api/nexum/skills/refresh`、`POST /api/nexum/skills/validate` | [Skill 注册管理](#skill-注册管理) | 已覆盖 |
| Nexum Runtime | `DELETE /api/nexum/skills/:id`、`POST /api/nexum/skills/:id/activate` | [Skill 注册管理](#skill-注册管理) | 已覆盖 |
| Nexum Runtime | `GET /api/nexum/role-prompt`、`PUT /api/nexum/role-prompt`、`DELETE /api/nexum/role-prompt` | [默认角色提示词](#默认角色提示词) | 已覆盖 |

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
| `GET` / `PUT` / `DELETE` | `/api/nexum/role-prompt` | 读取、保存和恢复默认角色提示词 |
| `GET` / `POST` | `/api/nexum/session` | 列出或创建 Session |
| `PUT` / `DELETE` | `/api/nexum/session/:sessionID` | 更新或删除 Session |
| `GET` | `/api/nexum/session/:sessionID/state` | 获取恢复状态 |
| `POST` | `/api/nexum/session/:sessionID/prompt` | 提交长任务 Prompt |
| `POST` | `/api/experimental/nexum/session/:sessionID/continue` | 从既有 User/Tool 上下文继续运行；实验性接口 |
| `POST` | `/api/nexum/session/:sessionID/cancel` | 取消当前运行 |
| `GET` | `/api/nexum/session/:sessionID/events` | 订阅 SSE 事件流 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/permission...` | 查询和回复权限请求 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/question...` | 查询、回答和取消结构化反问 |
| `GET` / `POST` / `DELETE` | `/api/nexum/skills...` | Skill 列表、详情、按地址注册、刷新、校验、取消注册和激活 |

## 默认角色提示词

默认角色提示词是独立于模型凭据和 Session 消息历史的全局配置。默认本地 Runtime 将它持久化到 `<dataDirectory>/role-prompt.json`，也可通过 `NEXUM_ROLE_PROMPT_FILE` 指定文件。文件采用原子替换写入并使用 `0600` 权限。

| 方法 | URL | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| `GET` | `/api/nexum/role-prompt` | 不适用 | `200`，`data` 为 `{prompt, source, updatedAt?}` |
| `PUT` | `/api/nexum/role-prompt` | `{prompt}`，非空字符串 | `200`，返回保存后的配置 |
| `DELETE` | `/api/nexum/role-prompt` | 不适用 | `200`，恢复内置默认配置 |

示例：

```http
PUT /api/nexum/role-prompt
Content-Type: application/json

{"prompt":"思考和回答都使用中文。"}
```

每次模型调用前，Nexum 将当前提示词原文作为 `system` 消息注入，来源标识固定为 `runtime:default-role`。该消息不会写入 Session 历史；resume、continue 和 compaction 后会重新读取最新配置。Nexum 不翻译、过滤或改写模型的 reasoning、tool 参数和文本输出，Agent 也不能通过工具修改该全局配置。

## Session 删除

### 接口概览

`DELETE /api/nexum/session/:sessionID` 删除指定 Session 的持久化历史和运行记录，但保留工作目录与模型配置。服务按 `messageStore`、可选 `interactionStore`、`eventHub`、`sessionService` 的顺序删除；任一步依赖失败都会返回稳定的 `NEXUM_SESSION_DELETE_FAILED`，不会暴露内部错误文本。

| 项目 | 内容 |
| --- | --- |
| 接口用途 | 删除不再需要的 Nexum Session 及其消息、交互和事件记录 |
| 调用方 | 已确认 Session 不再需要的 Runtime 客户端 |
| 前置条件 | `sessionID` 对应现存且当前不处于 `running` 状态的 Session |
| 权限要求 | 当前认证约定待确认；服务实现未校验认证信息 |
| 幂等性 | 重复删除不视为成功幂等：首次成功返回 `200`，之后返回 `404 NEXUM_SESSION_NOT_FOUND` |
| 数据保留 | 工作目录和模型配置不受影响 |

### 请求定义

#### Method and URL

```http
DELETE http://127.0.0.1:4097/api/nexum/session/{sessionID}
```

| 项目 | 内容 |
| --- | --- |
| Method | `DELETE` |
| URL | `/api/nexum/session/{sessionID}`；`sessionID` 必须进行 URL path 编码 |
| Content-Type | 不适用；请求体为空 |
| Accept | 可选；服务返回 JSON |

#### Path parameters

| 参数名 | 类型 | 必填 | 格式/范围 | 示例 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `{sessionID}` | string | 是 | 已存在的 Session 标识；作为 URL path segment 传输 | `session_001` | 待删除 Session |

#### Query parameters

不适用。

#### Request headers

| Header | 必填 | 类型/格式 | 示例 | 用途 | 缺失或非法时 |
| --- | --- | --- | --- | --- | --- |
| `X-Trace-Id` | 否 | 1-128 位字母、数字、`.`、`_`、`:` 或 `-` | `trace_delete_001` | 排障关联；响应 Header 和响应体会返回同一 trace ID | 缺失或非法时生成新的 trace ID |
| `Authorization` | 不适用 | — | — | 当前接口未实现认证校验 | 当前实现不会因缺失该 Header 返回认证错误 |

#### Request cookies

不适用。当前接口不读取或设置 Cookie。

#### requestBody

请求体不适用，必须为空；不得发送 JSON 删除参数。

### 响应定义

#### Response headers

所有 JSON 响应包含以下 Header：

| Header | 示例 | 用途 |
| --- | --- | --- |
| `Content-Type` | `application/json;charset=utf-8` | JSON 响应媒体类型 |
| `Cache-Control` | `no-store` | 禁止缓存删除结果 |
| `Vary` | `origin` | CORS 响应变化标识 |
| `X-Trace-Id` | `trace_delete_001` | 与响应体 `traceId` 一致 |

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

| 字段路径 | 类型 | 必有/可选 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `data.id` | string | 必有 | `session_001` | 被删除的 Session ID |
| `data.deleted` | boolean literal | 必有 | `true` | 固定为 `true`，表示删除成功 |
| `meta.protocolVersion` | string | 必有 | `nexum.runtime.v1` | 协议版本 |
| `meta.traceId` | string | 必有 | `trace_delete_001` | 请求链路标识 |

#### 错误响应

错误响应沿用统一错误结构，包含 `errorCode`、`message`、`traceId` 和 `meta`；`message` 不包含内部 Store 或异常文本。

| HTTP 状态码 | `errorCode` | 触发条件 | 调用方处理 |
| --- | --- | --- | --- |
| `404` | `NEXUM_SESSION_NOT_FOUND` | Session 未知或已经成功删除后再次删除 | 停止重试该 Session ID |
| `409` | `NEXUM_SESSION_RUN_CONFLICT` | Session 当前处于 `running`，或删除过程中检测到运行冲突 | 等待本轮运行结束后再发起删除 |
| `405` | `NEXUM_METHOD_NOT_ALLOWED` | 对该资源使用非 `PUT`/`DELETE` 方法 | 改用支持的方法 |
| `500` | `NEXUM_SESSION_DELETE_FAILED` | Message、Interaction、Event 或 Session Store 删除失败 | 使用 `traceId` 排障；按服务恢复策略重试 |

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

| 项目 | 约定 |
| --- | --- |
| 权限 | 当前服务认证约定待确认；注册/刷新/取消注册由调用方的 Nexum 管理权限边界负责，服务端不读取 Cookie。 |
| `Content-Type` | 有 JSON body 的 POST 使用 `application/json`；GET/DELETE 请求体不适用。 |
| `Accept` | 可选，推荐 `application/json`。 |
| `X-Trace-Id` | 可选，1-128 位安全字符；缺失或非法时服务生成新的 trace ID。 |
| Cookie | 请求 Cookie 和响应 Cookie 均不适用。 |
| 幂等性 | 同一规范化 address 重复注册不会创建重复记录；DELETE 重复执行返回 `404 NEXUM_SKILL_NOT_FOUND`。 |
| 地址安全 | 只接受本地目录；拒绝 HTTP(S)、路径遍历、源目录符号链接和 Skill 内符号链接。 |

### 端点覆盖

| 方法 | URL | 请求体 | 成功响应 | 实际错误 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/nexum/skills` | 不适用 | `200`，`data` 为 Skill 摘要数组 | `503 NEXUM_SKILL_REGISTRY_NOT_CONFIGURED` |
| `GET` | `/api/nexum/skills/:id` | 不适用 | `200`，`data` 为单个摘要 | `404 NEXUM_SKILL_NOT_FOUND` |
| `POST` | `/api/nexum/skills/register` | `{address}` | `200`，`data` 为注册后的摘要 | `400 NEXUM_INVALID_REQUEST` 或 `NEXUM_SKILL_REGISTER_FAILED` |
| `POST` | `/api/nexum/skills/refresh` | `{id?}` | `200`，`data` 为刷新后的数组 | `400 NEXUM_INVALID_REQUEST` |
| `POST` | `/api/nexum/skills/validate` | `{id?}` | `200`，`data.valid` 和摘要数组 | `400 NEXUM_INVALID_REQUEST` |
| `DELETE` | `/api/nexum/skills/:id` | 不适用 | `200`，`data.deleted=true` | `404 NEXUM_SKILL_NOT_FOUND` |
| `POST` | `/api/nexum/skills/:id/activate` | `{sessionID,text}` | `200`，`data` 为 Skill prompt attachment | `404`/`409` Skill 或 Session 错误 |

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
