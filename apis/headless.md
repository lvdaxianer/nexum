# Headless Service REST API

## 1. 模块概览与覆盖范围

| 项目            | 内容                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| 业务模块        | Headless Service 健康检查（`headless`）                                      |
| 文档路径        | `apis/headless.md`                                                           |
| 模块职责        | 为任意 UI 或运行编排器提供独立 Headless Service 的存活与就绪状态             |
| 基础 URL / 版本 | `http://127.0.0.1:4097`；当前为 POC，暂无版本前缀                            |
| 通用认证与约定  | 健康检查不要求认证；响应为 JSON；所有响应带 `X-Trace-Id`；响应 Cookie 不适用 |

### 1.1 对外 route 覆盖表

| Controller / 路由归属          | 对外端点                                | 文档章节                 | 覆盖状态 |
| ------------------------------ | --------------------------------------- | ------------------------ | -------- |
| `headless-server/src/index.ts` | `GET /health/live`、`GET /health/ready` | [健康检查](#21-健康检查) | 已覆盖   |

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
