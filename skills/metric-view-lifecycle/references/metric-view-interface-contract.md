# MetricView 管理接口契约

本文档是 Skill 侧管理接口的单一请求体说明。DSL 请求仍由
[`dsl-syntax.md`](dsl-syntax.md) 和对应 JSON Schema 管理；MetricView 是承载 DSL、Python 和最终输出定义的宿主对象。

## 请求体

| 端点 | 请求体 | 说明 |
|---|---|---|
| `POST /metricView/queryList` | `{"name":"..."}` | 仅按名称查询；返回列表或统一响应 `data` 中的列表 |
| `POST /metricView/queryById` | `{"id":"..."}` | 查询完整对象；更新必须先读取并保留稳定 ID、`function.id` 和未修改字段 |
| `POST /metricView/test` | 完整 MetricView 定义本身 | 裸定义，不包 `metricView`；仅测试，不持久化 |
| `POST /metricView/testExecute` | `{"metricView": <完整定义>, "param": <运行参数>}` | 已发布视图的参数化测试；`param` 只放运行参数 |
| `POST /metricView/save` | 完整且已设置最终 `status` 的 MetricView 定义本身 | 裸定义；仅在测试通过和用户确认后调用 |

所有请求均通过受控 HTTP 客户端发送。`test`、`testExecute` 和 `save` 在发送前必须通过本地 contract gate；失败时不得产生远程副作用。

## 响应和失败判断

- 统一响应通常使用 `data` 包裹业务结果；`test`/`testExecute` 的最终成功结果还必须有 `data.answer`，其中每一行字段严格等于 `function.returnDef.outKeyRefs`。
- `success=false`、存在 `error`、`errorCode` 或缺少要求的 `data` 时均视为失败，即使 HTTP 状态为 200。
- 失败观察至少保留 `errorCode`、安全 `message`、短字段级 `details` 和 `traceId`；不保存 Token、密码、完整请求体、原始响应或堆栈。
- 未知错误、鉴权失败、权限失败、超时和没有可解释诊断的执行失败不得转成空结果 Mock，也不得继续 `save`。

## 保存后复核

`save` 成功不等于生命周期完成。必须使用返回 ID 或稳定的唯一名称重新调用 `queryById`，复核名称、状态、说明、函数参数、返回定义、逻辑和代码。后端可以只消费测试所需的 `typeContext` 而不持久化它；这种差异必须记录为 `omittedFields`，不能误判为成功或失败。

## 字段来源边界

`status`、`origin`、`type` 和 `operation` 只有在后端 DTO、接口响应或用户明确提供证据时才可扩展取值。当前 Skill 仅把 fixture 已反复验证的 `PENDING_REVIEW`、`PUBLISHED` 和 `OPERATION_READ` 作为已知值；Schema 对所有未确认值保持 `string`，contract gate 在没有证据时阻断未知值。
