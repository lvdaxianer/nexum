# Headless Service REST API

## 1. 模块概览与覆盖范围

| 项目            | 内容                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| 业务模块        | Headless Service 健康检查与最小 Session 创建（`headless`）                   |
| 文档路径        | `apis/headless.md`                                                           |
| 模块职责        | 为任意 UI 或运行编排器提供独立 Headless Service 的健康状态与 Session 创建    |
| 基础 URL / 版本 | `http://127.0.0.1:4097`；当前为 POC，暂无版本前缀                            |
| 通用认证与约定  | 健康检查不要求认证；响应为 JSON；所有响应带 `X-Trace-Id`；响应 Cookie 不适用 |

### 1.1 对外 route 覆盖表

| Controller / 路由归属          | 对外端点                                                                         | 文档章节                         | 覆盖状态 |
| ------------------------------ | -------------------------------------------------------------------------------- | -------------------------------- | -------- |
| `headless-server/src/index.ts` | `GET /health/live`、`GET /health/ready`                                          | [健康检查](#21-健康检查)         | 已覆盖   |
| `headless-server/src/index.ts` | `POST /api/experimental/headless/session`                                        | [Session 创建](#31-session-创建) | 已覆盖   |
| `headless-server/src/index.ts` | `POST /api/experimental/headless/session/:sessionID/prompt`                      | [Prompt 提交](#41-prompt-提交)   | 已覆盖   |
| `headless-server/src/index.ts` | `POST /api/experimental/headless/session/:sessionID/cancel`                      | [Session 取消](#51-session-取消) | 已覆盖   |
| `headless-server/src/index.ts` | `GET /api/experimental/headless/session/:sessionID/events`                       | [Session 事件](#81-session-事件) | 已覆盖   |
| `headless-server/src/index.ts` | `GET /api/experimental/headless/session/:sessionID/permission`                   | [权限列表](#61-权限列表)         | 已覆盖   |
| `headless-server/src/index.ts` | `POST /api/experimental/headless/session/:sessionID/permission/:requestID/reply` | [权限审批](#71-权限审批)         | 已覆盖   |

## 2. 健康检查

### 2.1 接口概览

| 项目     | 内容                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| 接口名称 | Headless Service 健康检查                                                         |
| 接口用途 | 检查服务进程是否存活，以及是否可以接收后续 Headless 请求                          |
| 业务场景 | UI、进程编排器或容器探针在启动后调用；不创建 Session，不执行模型或工具            |
| 权限要求 | 当前 POC 不要求认证；服务默认只绑定 `127.0.0.1`，对外暴露前需由部署层补充访问控制 |
| 幂等性   | GET 幂等；重复调用只读取进程状态，不改变服务数据                                  |
| 版本     | 当前 POC 无 URL 版本前缀；响应字段变更需同步调用方                                |

### 2.2 请求定义

#### 2.2.1 Method and URL

```http
GET http://127.0.0.1:4097/health/live
GET http://127.0.0.1:4097/health/ready
```

| 项目         | 内容                                              |
| ------------ | ------------------------------------------------- |
| Method       | `GET`                                             |
| URL          | `/health/live` 检查存活；`/health/ready` 检查就绪 |
| Content-Type | 不适用，无请求体                                  |
| Accept       | 推荐 `application/json`；服务返回 JSON            |

#### 2.2.2 param

##### Path parameters

不适用。

##### Query parameters

不适用。

##### Form or other parameters

不适用。

#### 2.2.3 Request headers

| Header       | 必填 | 类型/格式                                                   | 示例                | 用途             | 缺失或非法时                    |
| ------------ | ---- | ----------------------------------------------------------- | ------------------- | ---------------- | ------------------------------- |
| `X-Trace-Id` | 否   | `1`-`128` 个 ASCII 字符，允许字母、数字、`.`、`_`、`:`、`-` | `trace_example_001` | 透传排障链路标识 | 缺失或非法时由服务生成新的 UUID |
| `Accept`     | 否   | MIME type                                                   | `application/json`  | 声明期望响应类型 | 服务仍返回 JSON                 |

#### 2.2.4 Request cookies

请求 Cookie：不适用。

#### 2.2.5 requestBody

请求体：不适用。

### 2.3 响应定义

#### 2.3.1 Response overview

| HTTP 状态码              | 业务含义   | 触发条件                        | 调用方处理                                        |
| ------------------------ | ---------- | ------------------------------- | ------------------------------------------------- |
| `200 OK`                 | 检查成功   | 路径正确且方法为 `GET`          | `/health/live` 视为存活；`/health/ready` 视为就绪 |
| `404 Not Found`          | 路径不存在 | 请求其他路径                    | 修正路径；不要按服务就绪处理                      |
| `405 Method Not Allowed` | 方法不支持 | 对健康检查路径使用非 `GET` 方法 | 改用 `GET`                                        |

未实现认证、限流、分页、排序、过滤和幂等键校验；如后续将健康接口暴露到不可信网络，需在服务边界补充认证和限流。

#### 2.3.2 Response headers

| Header          | 出现条件               | 示例                | 用途                 |
| --------------- | ---------------------- | ------------------- | -------------------- |
| `Content-Type`  | 所有有响应体的响应     | `application/json`  | 响应媒体类型         |
| `Cache-Control` | 所有健康检查和错误响应 | `no-store`          | 防止探针读取过期状态 |
| `X-Trace-Id`    | 所有响应               | `trace_example_001` | 关联调用方排障链路   |

#### 2.3.3 Response cookies

响应 Cookie：不适用。

#### 2.3.4 Success response

`GET /health/live`：

```json
{
  "service": "headless-server",
  "status": "ok"
}
```

`GET /health/ready`：

```json
{
  "service": "headless-server",
  "status": "ready"
}
```

| 字段路径  | 类型   | 必有/可选 | nullable | 示例              | 说明                     |
| --------- | ------ | --------- | -------- | ----------------- | ------------------------ |
| `service` | string | 必有      | 否       | `headless-server` | 服务标识                 |
| `status`  | string | 必有      | 否       | `ok` / `ready`    | 与检查路径对应的健康状态 |

#### 2.3.5 Error response

```json
{
  "errorCode": "HEADLESS_ROUTE_NOT_FOUND",
  "message": "请求路径不存在",
  "traceId": "trace_example_002"
}
```

| 字段路径    | 类型   | 必有/可选 | 示例                       | 说明                              |
| ----------- | ------ | --------- | -------------------------- | --------------------------------- |
| `errorCode` | string | 必有      | `HEADLESS_ROUTE_NOT_FOUND` | 稳定机器可读错误码                |
| `message`   | string | 必有      | `请求路径不存在`           | 安全的中文错误消息                |
| `traceId`   | string | 必有      | `trace_example_002`        | 与 `X-Trace-Id` 相同的排障关联 ID |

错误码：`HEADLESS_ROUTE_NOT_FOUND` 对应 `404`；`HEADLESS_METHOD_NOT_ALLOWED` 对应 `405`。

### 2.4 Complete example

#### 2.4.1 curl request

```bash
curl --request GET 'http://127.0.0.1:4097/health/ready' \
  --header 'Accept: application/json' \
  --header 'X-Trace-Id: trace_example_001'
```

#### 2.4.2 Raw HTTP request

```http
GET /health/ready HTTP/1.1
Host: 127.0.0.1:4097
Accept: application/json
X-Trace-Id: trace_example_001
```

#### 2.4.3 Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
X-Trace-Id: trace_example_001

{"service":"headless-server","status":"ready"}
```

响应 Cookie：不适用。

#### 2.4.4 Typical failure response

```http
HTTP/1.1 404 Not Found
Content-Type: application/json
Cache-Control: no-store
X-Trace-Id: trace_example_002

{"errorCode":"HEADLESS_ROUTE_NOT_FOUND","message":"请求路径不存在","traceId":"trace_example_002"}
```

### 2.5 Common conventions checklist

- 认证：当前 POC 健康接口不认证，服务默认绑定本机；公网部署前必须增加网络访问控制或认证。
- 幂等：GET 只读且幂等，不需要 `Idempotency-Key`。
- 分页/排序/过滤：不适用。
- 时间：不返回时间字段，不适用。
- 错误：错误体只返回稳定错误码、中文消息和 trace ID，不返回堆栈或内部路径。
- 安全：`X-Trace-Id` 会校验长度和字符集；非法值不会原样进入响应。

## 3. Session 创建

### 3.1 接口概览

| 项目     | 内容                                                                  |
| -------- | --------------------------------------------------------------------- |
| 接口名称 | Headless Session 创建                                                 |
| 接口用途 | 校验工作目录并创建一个初始状态为 `idle` 的独立 Session                |
| 业务场景 | UI 或编排器在发送 Prompt 前申请 Session；本接口不启动模型、不执行工具 |
| 权限要求 | 当前 POC 不要求认证；服务默认只绑定 `127.0.0.1`                       |
| 幂等性   | 非幂等；每次成功调用生成新的 Session ID                               |
| 版本     | 当前为实验性 `/api/experimental` 路由                                 |

### 3.2 请求定义

#### 3.2.1 Method and URL

```http
POST http://127.0.0.1:4097/api/experimental/headless/session
```

| 项目         | 内容                                   |
| ------------ | -------------------------------------- |
| Method       | `POST`                                 |
| URL          | `/api/experimental/headless/session`   |
| Content-Type | `application/json`                     |
| Accept       | 推荐 `application/json`；服务返回 JSON |

#### 3.2.2 Request headers

沿用健康检查的 `X-Trace-Id` 约定；请求体必须是 JSON。

#### 3.2.3 requestBody

```json
{
  "directory": "/Users/example/project"
}
```

| 字段路径    | 类型   | 必有/可选 | 约束                         | 说明               |
| ----------- | ------ | --------- | ---------------------------- | ------------------ |
| `directory` | string | 必有      | 非空绝对路径，须为可读写目录 | Session 的工作目录 |

### 3.3 响应定义

#### 3.3.1 Response overview

| HTTP 状态码              | 业务含义       | 触发条件                                    | 调用方处理                    |
| ------------------------ | -------------- | ------------------------------------------- | ----------------------------- |
| `200 OK`                 | 创建成功       | 工作目录校验通过                            | 保存 `data.id` 并订阅后续事件 |
| `400 Bad Request`        | 请求或目录无效 | JSON 字段无效、目录不存在、非目录或不可访问 | 修正目录或请求体后重试        |
| `404 Not Found`          | 路径不存在     | 请求其他路径                                | 修正路径                      |
| `405 Method Not Allowed` | 方法不支持     | 对创建路径使用非 `POST` 方法                | 改用 `POST`                   |

#### 3.3.2 Success response

```json
{
  "data": {
    "id": "2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7",
    "directory": "/Users/example/project",
    "status": "idle"
  }
}
```

`status` 当前固定为 `idle`；Session 状态迁移由 Headless Core 管理。

#### 3.3.3 Error response

错误体沿用健康检查的 `errorCode`、`message`、`traceId` 字段。错误码包括：

- `HEADLESS_INVALID_REQUEST`：请求体缺少非空 `directory` 字段。
- `HEADLESS_INVALID_DIRECTORY`：目录不是绝对路径、不存在、不是目录或不可读写。
- `HEADLESS_ROUTE_NOT_FOUND`、`HEADLESS_METHOD_NOT_ALLOWED`：路径或方法错误。

### 3.4 Complete example

#### 3.4.1 curl request

```bash
curl --request POST 'http://127.0.0.1:4097/api/experimental/headless/session' \
  --header 'Content-Type: application/json' \
  --header 'X-Trace-Id: session_create_trace' \
  --data '{"directory":"/Users/example/project"}'
```

#### 3.4.2 Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
X-Trace-Id: session_create_trace

{"data":{"id":"2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7","directory":"/Users/example/project","status":"idle"}}
```

## 4. Prompt 提交

### 4.1 接口概览

| 项目     | 内容                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 接口名称 | Headless Prompt 提交                                                               |
| 接口用途 | 将文本 Prompt 投递到指定 Session 的 Coding Loop                                    |
| 业务场景 | UI 在 Session 创建成功后提交用户任务；模型输出、工具事件和完成状态通过事件端口发布 |
| 权限要求 | 当前 POC 不要求认证；工具执行仍必须经过 Headless Core 的 PermissionPort            |
| 幂等性   | 当前 POC 不承诺幂等；重复提交可能启动多个运行请求                                  |
| 版本     | 当前为实验性 `/api/experimental` 路由                                              |

### 4.2 请求定义

#### 4.2.1 Method and URL

```http
POST http://127.0.0.1:4097/api/experimental/headless/session/{sessionID}/prompt
```

| 项目         | 内容                                                   |
| ------------ | ------------------------------------------------------ |
| Method       | `POST`                                                 |
| URL          | `/api/experimental/headless/session/:sessionID/prompt` |
| Content-Type | `application/json`                                     |

#### 4.2.2 Path parameters

| 参数        | 类型   | 必有/可选 | 说明                |
| ----------- | ------ | --------- | ------------------- |
| `sessionID` | string | 必有      | 已创建的 Session ID |

#### 4.2.3 requestBody

```json
{
  "text": "请读取 README.md 并总结主要内容"
}
```

| 字段路径 | 类型   | 必有/可选 | 约束       | 说明             |
| -------- | ------ | --------- | ---------- | ---------------- |
| `text`   | string | 必有      | 非空字符串 | 用户 Prompt 文本 |

### 4.3 响应定义

#### 4.3.1 Response overview

| HTTP 状态码               | 业务含义       | 触发条件                         | 调用方处理             |
| ------------------------- | -------------- | -------------------------------- | ---------------------- |
| `200 OK`                  | 已接受         | Prompt 校验通过且 Runtime 已配置 | 订阅事件并等待终态事件 |
| `400 Bad Request`         | 请求无效       | `text` 缺失或为空                | 修正请求后重试         |
| `404 Not Found`           | Session 不存在 | 目标 Session ID 未找到           | 先创建或刷新 Session   |
| `503 Service Unavailable` | Runtime 未配置 | 尚未注入 Model/Tool/Permission   | 完成运行时配置后重试   |

#### 4.3.2 Success response

```json
{
  "data": {
    "status": "accepted"
  }
}
```

接口只确认 Prompt 已进入异步 Coding Loop；模型文本、工具请求、工具结果和完成/失败事件不在本响应中返回。

### 4.4 Complete example

#### 4.4.1 curl request

```bash
curl --request POST 'http://127.0.0.1:4097/api/experimental/headless/session/2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7/prompt' \
  --header 'Content-Type: application/json' \
  --header 'X-Trace-Id: prompt_trace_001' \
  --data '{"text":"请读取 README.md 并总结主要内容"}'
```

#### 4.4.2 Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
X-Trace-Id: prompt_trace_001

{"data":{"status":"accepted"}}
```

## 5. Session 取消

### 5.1 接口概览

| 项目     | 内容                                                        |
| -------- | ----------------------------------------------------------- |
| 接口名称 | Headless Session 取消                                       |
| 接口用途 | 请求停止指定 Session 的当前 Coding Loop，并阻止后续工具执行 |
| 业务场景 | UI 在运行中主动停止任务，或对空闲 Session 做幂等取消        |
| 权限要求 | 当前 POC 不要求认证；服务默认只绑定 `127.0.0.1`             |
| 幂等性   | 对空闲或终态 Session 重复调用不会启动新运行                 |
| 版本     | 当前为实验性 `/api/experimental` 路由                       |

### 5.2 请求定义

#### 5.2.1 Method and URL

```http
POST http://127.0.0.1:4097/api/experimental/headless/session/{sessionID}/cancel
```

| 项目   | 内容                                                   |
| ------ | ------------------------------------------------------ |
| Method | `POST`                                                 |
| URL    | `/api/experimental/headless/session/:sessionID/cancel` |

### 5.3 响应定义

#### 5.3.1 Response overview

| HTTP 状态码     | 业务含义       | 触发条件               | 调用方处理                    |
| --------------- | -------------- | ---------------------- | ----------------------------- |
| `200 OK`        | 取消已接受     | Session 存在           | 监听 `session.cancelled` 事件 |
| `404 Not Found` | Session 不存在 | 目标 Session ID 未找到 | 刷新 Session 列表             |
| `409 Conflict`  | 取消冲突       | 状态迁移不允许         | 读取当前状态后决定下一步      |

#### 5.3.2 Success response

```json
{
  "data": {
    "status": "cancelled"
  }
}
```

运行中的取消会通过事件端口发布 `session.cancelled`；模型或工具已经开始的单步操作不会被强行杀死，但下一次工具边界不会继续执行。

### 5.4 Complete example

#### 5.4.1 curl request

```bash
curl --request POST 'http://127.0.0.1:4097/api/experimental/headless/session/2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7/cancel' \
  --header 'X-Trace-Id: cancel_trace_001'
```

#### 5.4.2 Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
X-Trace-Id: cancel_trace_001

{"data":{"status":"cancelled"}}
```

## 6. 权限列表

### 6.1 接口概览

| 项目     | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| 接口名称 | Headless Pending Permission 列表                              |
| 接口用途 | 查询指定 Session 当前阻塞 Coding Loop 的工具权限请求          |
| 业务场景 | UI 订阅或轮询列表后展示 action、resource 和审批按钮           |
| 权限要求 | 当前 POC 不要求认证；生产部署必须在服务边界补充身份与访问控制 |
| 幂等性   | GET 幂等；只读取内存中的 pending request                      |

### 6.2 请求定义

```http
GET http://127.0.0.1:4097/api/experimental/headless/session/{sessionID}/permission
```

请求体和 Query 参数：不适用。

### 6.3 响应定义

```json
{
  "data": [
    {
      "id": "permission-request-id",
      "sessionID": "2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7",
      "action": "shell",
      "resource": "pnpm test",
      "reason": "工具 shell 需要权限审批"
    }
  ]
}
```

未有待审批请求时返回 `{"data":[]}`。请求项只包含审批所需的 action/resource 摘要，不包含凭据。

## 7. 权限审批

### 7.1 接口概览

| 项目     | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| 接口名称 | Headless Permission Reply                                     |
| 接口用途 | 对 pending tool request 提交一次性允许、永久允许或拒绝决策    |
| 业务场景 | UI 用户点击审批按钮后唤醒阻塞的 Coding Loop                   |
| 权限要求 | 当前 POC 不要求认证；生产部署必须在服务边界补充身份与访问控制 |
| 幂等性   | 同一 request 的重复 reply 返回第一次已生效的决策              |

### 7.2 请求定义

```http
POST http://127.0.0.1:4097/api/experimental/headless/session/{sessionID}/permission/{requestID}/reply
```

```json
{
  "decision": "allow_once"
}
```

`decision` 可选值：`allow_once`、`allow_always`、`deny`。`allow_always` 按 action/resource 组合记录内存策略；POC 重启后策略丢失。

### 7.3 响应定义

允许响应：

```json
{
  "data": {
    "status": "approved"
  }
}
```

拒绝响应的 `status` 为 `denied`。未知 request 返回 `404 HEADLESS_PERMISSION_NOT_FOUND`；非法决策返回 `400 HEADLESS_INVALID_REQUEST`。

### 7.4 Complete example

```bash
curl --request POST 'http://127.0.0.1:4097/api/experimental/headless/session/2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7/permission/permission-request-id/reply' \
  --header 'Content-Type: application/json' \
  --data '{"decision":"allow_once"}'
```

## 8. 模型配置

### 8.1 接口概览

| 项目     | 内容                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 接口名称 | Headless 单模型配置                                                            |
| 接口用途 | 保存和读取一个 OpenAI-compatible Base URL、模型名称和凭据引用                  |
| 业务场景 | 外部 UI 在启动 Coding Loop 前配置活动模型                                      |
| 权限要求 | 当前 POC 不要求认证；生产部署必须在服务边界补充身份与访问控制                  |
| 幂等性   | PUT 幂等；有效配置覆盖当前配置，非法配置不会覆盖旧值                           |
| 安全     | 响应只返回 `credentialConfigured` 和可选 `credentialRef`，不返回 credential 值 |

### 8.2 读取配置

```http
GET http://127.0.0.1:4097/api/experimental/headless/model
```

未配置时返回 `{"data":null}`；已配置时示例：

```json
{
  "data": {
    "baseUrl": "https://model.example.com/v1",
    "model": "coding-model",
    "credentialConfigured": true
  }
}
```

### 8.3 更新配置

```http
PUT http://127.0.0.1:4097/api/experimental/headless/model
```

```json
{
  "baseUrl": "https://model.example.com/v1",
  "model": "coding-model",
  "credentialRef": "MODEL_API_KEY"
}
```

`credential` 可直接提交凭据值，但服务响应、事件和普通错误不会返回该值；生产建议只提交环境变量名 `credentialRef`。

非法 URL、空模型名或同时提交 `credential` 与 `credentialRef` 返回 `400 HEADLESS_INVALID_MODEL_CONFIG`，且保留上一份有效配置。

Headless Core 的 `createHeadlessConfiguredCodingLoop` 会在每次新运行时读取这份活动配置，并只请求该 Base URL；端点不可达返回安全的“模型服务不可达”，`401/403` 返回“模型认证失败”，不会静默切换其他 Provider。

## 9. Session 事件

### 9.1 接口概览

| 项目     | 内容                                                                 |
| -------- | -------------------------------------------------------------------- |
| 接口名称 | Headless Session SSE 事件流                                          |
| 接口用途 | 将指定 Session 的有序运行事件持续推送给任意 UI                       |
| 业务场景 | UI 创建 Session 后订阅；Prompt、工具请求、权限和终态事件从此出口读取 |
| 权限要求 | 当前 POC 不要求认证；生产部署必须在服务边界补充身份与访问控制        |
| 幂等性   | GET 只建立订阅，不修改 Session 状态                                  |

### 9.2 请求定义

```http
GET http://127.0.0.1:4097/api/experimental/headless/session/{sessionID}/events
```

响应类型为 `text/event-stream; charset=utf-8`。连接应在 UI 销毁或切换 Session 时关闭；未知 Session 返回 `404 HEADLESS_SESSION_NOT_FOUND`。

### 9.3 事件格式

```text
id: 3
data: {"type":"tool.requested","sessionID":"2b4d1c52-8e71-4fb8-9b2a-39f3a55ec6f7","sequence":3,"data":{"toolName":"read"}}

```

`id` 使用 Session 内递增的 `sequence`；`data` 是 JSON 编码的 RuntimeEvent。当前 POC 事件 Hub 为进程内内存实现，不提供断线补发和跨进程持久化；生产版本应在部署拓扑确定后替换为可恢复的事件总线或事件存储。
