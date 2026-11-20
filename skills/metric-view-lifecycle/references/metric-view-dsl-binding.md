# MetricView 与关系 DSL 绑定

同步来源：`dinghai-dsl-engine/docs/dsl-syntax.md` 与同目录
`schemas/relational-query-v1.schema.json`；协议版本：`relational-query` v1。

本文件只定义 Skill 如何使用引擎拥有的 `relational-query` v1。引擎语法的唯一快照是同目录的 [`dsl-syntax.md`](dsl-syntax.md) 和 [`schemas/relational-query-v1.schema.json`](schemas/relational-query-v1.schema.json)；本文件不能另行发明 DSL 节点或操作符。

## 两层对象必须分开

引擎 DSL 请求体是一个完整的结构化对象，形状固定为：

```json
{
  "dslType": "relational-query",
  "version": 1,
  "payload": {
    "from": {"table": "fact_outage", "alias": "f"},
    "select": [{"field": "f.event_time", "alias": "event_time"}],
    "where": {
      "and": [{
        "field": "f.event_time",
        "operator": "gte",
        "parameter": "window_start",
        "logicalType": "instant"
      }]
    },
    "limit": 100
  },
  "parameters": {
    "window_start": "2026-11-19T00:00:00Z"
  }
}
```

`from`、`select`、`joins`、`where`、`groupBy`、`orderBy` 和 `limit` 属于
`payload`；参数值属于顶层 `parameters`。条件不能使用 `where[].value`，固定枚举、区域和技术类型也必须通过 `parameter` 绑定。

MetricView 定义是宿主对象，另有 `name`、`origin`、`type`、`operation`、`parameters`、`returnDef`、`logic`、`code`、`matchQuestions` 和 `typeContext` 等字段。`returnDef` 描述最终 `answer` 的字段、类型和顺序；DSL 的 `select` 只描述中间查询行，不能自动替代 `returnDef`。

如果 Python 宿主协议需要把 DSL 放进更大的业务请求，外层包装属于 MetricView/Python 协议，不改变 DSL 本体。例如 `{"dsl": <上面的完整对象>, ...}` 中，`dsl` 的值仍必须完整保留 `dslType`、`version`、`payload` 和 `parameters`，不能把 `payload` 直接当成引擎请求。

## 路由与参数

- 全部来源是本体表时调用 `POST /dsl/execute`。
- 只要包含非本体表，或本体与非本体混合，就调用 `POST /metricView/dsl/execute`。
- 两个路由都接收同一个 `relational-query` v1 DSL；路由选择不改变字段名、操作符或参数形状。
- `domainId`、`userId` 和 Token 来自可信会话或受控运行时绑定，不写入 DSL 来取得授权。
- 地址和 Token 使用注册表占位符；Skill 不把真实凭据写进定义、Python、日志或 Mock。

## 类型与时间

`typeContext.fields` 记录 DDL/JDBC 原始类型，`typeContext.predicates` 记录字段、操作符、参数名和规范化后的 DSL `logicalType`。按 [`type-mapping.md`](type-mapping.md) 映射：`DATETIME/DATETIMEV2` 使用 `local_datetime`，`TIMESTAMP` 及带时区变体使用 `instant`，`DATE` 使用 `date`。

关系 DSL v1 只有 `eq`、`neq`、`not-eq`、`gt`、`gte`、`lt`、`lte`、`like` 和 `in`。只有 `in` 使用数组参数；`not_in` 和 `between` 不得生成。时间窗口必须用同一字段的 `gte(window_start)` 与 `lt(window_end)` 表达 `[start, end)`，并让两个参数使用同一个时间逻辑类型。

Mock 行禁止使用 `null`，因为 Mock 用于验证合成输出结构；真实查询返回的业务字段允许为 `null`，这两条规则不冲突。真实空结果是否进入 Mock，只按 Skill 的最终返回契约处理，不能把接口失败伪装成空结果。

## 生成前后检查

1. 先用 JSON Schema 做结构检查，再由引擎解析器检查表/字段、参数引用、JOIN 和资源限制。
2. 用类型兼容校验器核对 DDL/JDBC、DSL `logicalType` 和 MetricView `TYPE_*` 三层证据。
3. 生成 Python 前确认执行路由；生成后确认 Python 传递的是完整 DSL 对象，而不是旧的 `sources`/`dimensions`/`measures` 结构。
4. 只有类型门禁和 Coding Gate 都通过，才可进入 MetricView `test`；测试成功、用户确认并保存后，再通过 `queryById` 复核。
