# MetricView 错误码 Repair/Stop 矩阵

机器判定由 `scripts/error_code_matrix.py` 提供；本表是面向 Skill 的单一修复口径。所有错误都必须先 Observe `errorCode`、安全 `details` 和 `traceId`，没有可解释证据时停止。

| errorCode | Observe | 允许 Repair | 禁止 Repair | Stop 条件 |
|---|---|---|---|---|
| `UNKNOWN_FIELD` / `FIELD_NOT_RESOLVED` | `field/table/path` | 依据 DDL/JDBC 修复字段引用、别名或参数绑定 | 盲换字段、换表、拼 SQL | 缺字段诊断或元数据无法确认 |
| `INVALID_DSL_REQUEST` | `path/suggestion` | 回到 DSL Schema 修复结构 | 改成 SQL 或删除查询条件掩盖错误 | 没有结构路径 |
| `INVALID_OPERATOR` | `operator/path/suggestion` | 只使用 DSL Schema 登记的操作符 | 猜测后端支持的操作符 | 缺操作符证据 |
| `PARAMETER_TYPE_MISMATCH` / `PARAMETER_TYPE_INVALID` | 参数、期望/实际类型 | 同时修正 `TYPE_*`、`logicalType`、`typeContext` | 用样例值绕过类型证据 | 类型字段缺失 |
| `EXECUTION_TIMEOUT` | deadline、limit、查询范围或服务端超时证据 | 只收窄范围、检查 limit/deadline | 盲目换字段、无限重试 | 没有范围/超时证据 |
| `TABLE_NOT_ALLOWED` | 表范围、域、Token 绑定 | 无 | 换 Token、扩大权限、换表绕过策略 | 立即停止 |
| `UNAUTHENTICATED` / `FORBIDDEN` | 请求上下文、路径、traceId | 无 | 猜 Token、改权限、自动合成冒充真实 | 立即停止 |
| `METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH` / `OUTPUT_SCHEMA_VALIDATE` | expected/actual/missing/unexpected/rowIndex | 保留 `returnDef`，修复最终映射或 DSL 包裹层 | 用源表字段改写目标结构、用 Mock 掩盖 | 结构证据缺失 |
| `METRIC_VIEW_EXECUTION_FAILED` | `traceId` 和服务端诊断 | 只有 details 能定位根因时修复 | 盲换字段、继续保存 | details 为空或无法取证 |
| 其他错误 | HTTP 状态、traceId、服务诊断 | 无 | 把未知错误转为空结果 Mock | 统一停止 |

错误修复最多三轮。任一错误分支都不能在测试成功前调用 `save`；鉴权、权限、未知和无诊断错误不得调用 Repair 回调。
