# 接口驱动 ReAct 循环

指标视图 Skill 必须把测试当作接口驱动的 ReAct 循环，而不是浏览器操作。页面可以作为人工查看工具，但 Skill 不得点击按钮、读取页面 DOM 或把页面弹窗当作测试接口。

## 固定流程

每个候选定义都按以下顺序执行：

```text
Plan → Execute → Observe → Repair → Execute
```

1. **Plan**：记录来源表、路由、参数类型、期望返回字段、测试模式和当前修复假设；不得记录 Token、密码或完整业务数据。
2. **Execute**：候选定义调用 `POST /metricView/test`；已发布视图带参数验证调用 `POST /metricView/testExecute`，请求体为 `{"metricView": <定义>, "param": <参数>}`。Python 内部再按路由调用 `/dsl/execute` 或 `/metricView/dsl/execute`。
3. **Observe**：读取 HTTP 状态、`success`、`errorCode`、安全 `message`、`details`、`traceId`、返回字段类型、行数和空值情况。业务失败响应是观察结果，不是未处理异常。
4. **Repair**：只能根据 DDL/JDBC 元数据、接口诊断和当前候选定义修改一项根因；禁止盲目轮换字段、表名、类型或时间值。
5. **Repeat**：修复后重新调用同一个接口，从新的 Plan 开始。最多 3 轮；第 3 轮仍失败时停止并报告最后一个 `errorCode`、`details` 和 `traceId`。

## 接口边界

- 先读取 `GET /runtime-variables/catalog`，再用 `POST /metricView/queryList`、`POST /metricView/queryById` 发现和读取已有定义。
- 测试候选定义只调用 `POST /metricView/test`；已发布指标的实际参数测试只调用 `POST /metricView/testExecute`，不调用页面内部事件。
- 测试成功且用户确认后才调用 `POST /metricView/save`；保存后必须调用 `POST /metricView/queryById` 复核。Skill 的成功条件是三步接口链路全部成功，不能停在 `test` 成功。
- Skill 通过受控运行时上下文发送 `X-Trusted-Token`。不得要求页面用户再次输入 Token，不得从 Token 推算 `domainId`，不得把 Token 写入候选定义、文件、日志或报告。
- HTTP 4xx/5xx、超时和无效 JSON 属于传输或服务边界失败；只有拿到可解释的业务错误详情时才自动修复。鉴权、表权限和服务不可用不能通过换字段绕过。

## 错误到修复的最小规则

完整矩阵见 [`error-code-matrix.md`](error-code-matrix.md)，下面保留流程内的快速索引；机器决策由 `scripts/error_code_matrix.py` 执行。

| errorCode | Observe 重点 | 允许的 Repair |
|---|---|---|
| `UNKNOWN_FIELD` / `FIELD_NOT_RESOLVED` | `details.field`、`details.table`、`details.path` | 先区分字段引用和常量条件；关系 DSL 的常量必须由 `parameter` 绑定，不能使用 `value`；再用 JDBC/DDL 核对真实表列、物理名、逻辑别名和 DSL 别名 |
| `PARAMETER_TYPE_MISMATCH` / `PARAMETER_TYPE_INVALID` | 参数、数据库类型、DSL 类型、MetricView 类型 | 按类型映射同时修正 `TYPE_*`、`logicalType` 和 `typeContext` |
| `INVALID_DSL_REQUEST` / `INVALID_OPERATOR` | Schema 路径、操作符和引擎诊断 | 回到 DSL Schema 修复结构或操作符；没有证据停止 |
| `EXECUTION_TIMEOUT` | deadline、limit、查询范围、服务端超时证据 | 只收窄范围或检查 deadline；没有证据停止，不盲目换字段 |
| `TABLE_NOT_ALLOWED` | 表范围、域和 Token 绑定 | 停止并报告权限边界，不扩大权限、不换 Token |
| `UNAUTHENTICATED` / `FORBIDDEN` | 当前请求上下文和路径范围 | 停止；请求受控凭据或切换合成模式 |
| `METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH` / `OUTPUT_SCHEMA_VALIDATE` | `expectedKeys`、`actualKeys`、`missingKeys`、`unexpectedKeys`、`rowIndex` | 保留目标 `returnDef` 不变，修复中间行到目标行的字段映射；`actualKeys=[data]` 时拆掉 DSL 包裹层；本地校验后重新测试 |
| `METRIC_VIEW_EXECUTION_FAILED` 且 `details` 为空 | `traceId`、服务端日志、候选 `returnDef` 和最终输出摘要 | 先按 traceId 获取真实原因；若确认是输出契约错误，按上一行修复；没有证据时停止，不盲目轮换字段或使用 Mock |
| `METRIC_VIEW_EXECUTION_FAILED` 且有可解释 `details` | `traceId`、阶段和安全字段 | 只修复诊断指向的根因；仍最多三轮 |
| 成功但 `rowCount=0` | 实际数据范围、枚举值和时间窗口 | 保留真实元数据和空结果证据，按指标视图最终返回定义在最终 `answer` 边界生成 schema-compatible mock；不写库、不生成源表 Mock 行，标记真实结构通过和合成数据边界，不把空结果当作 DSL 错误 |
| `TABLE_NOT_ALLOWED` / `UNAUTHENTICATED` / `FORBIDDEN` | 表范围、路径、域和 Token 绑定 | 立即停止；不换 Token、不扩大权限、不进入 Mock |
| 其他错误 | `traceId`、HTTP 状态、服务日志摘要 | 不猜测修复；保留证据并停止，避免重复调用 |

## 轮次证据

每轮至少保留以下不含敏感值的记录：

```json
{
  "round": 1,
  "mode": "real",
  "execute": {"endpoint": "/metricView/test"},
  "observe": {
    "ok": false,
    "errorCode": "UNKNOWN_FIELD",
    "details": {"field": "t.stat_time", "table": "fact_wireless_outage_timeline"},
    "traceId": "..."
  },
  "repair": {"changed": "DSL field mapping", "evidence": "JDBC metadata"}
}
```

成功后记录返回结构摘要，不输出完整业务行。测试通过不等于保存授权；仍需执行回填确认、保存和保存后复核。`save` 或 `queryById` 失败时，必须报告结构化错误，不能把原始 traceback 直接交给用户。
