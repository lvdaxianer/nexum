# DDL、DSL 与 MetricView 参数类型映射

这是指标视图生成和测试的唯一类型映射来源。生成器、静态门禁、回填脚本和测试必须使用同一套规则；不允许根据字段名、样例值或页面显示文本猜测类型。

| DDL/JDBC 类型 | DSL `logicalType` | MetricView 参数类型 |
| --- | --- | --- |
| `VARCHAR`、`CHAR`、`TEXT` | `string` | `TYPE_STRING` |
| `TINYINT`、`SMALLINT`、`INT`、`INTEGER` | `integer` | `TYPE_NUMBER` |
| `BIGINT` | `long` | `TYPE_NUMBER` |
| `DECIMAL`、`NUMERIC`、`FLOAT`、`REAL`、`DOUBLE` | `decimal` | `TYPE_NUMBER` |
| `BOOLEAN`、`BIT` | `boolean` | `TYPE_STRING` |
| `DATE` | `date` | `TYPE_TIME` |
| `DATETIME`、`DATETIMEV2` | `local_datetime` | `TYPE_TIME` |
| `TIMESTAMP`、`TIMESTAMP WITH TIME ZONE` | `instant` | `TYPE_TIME` |
| `TIME` | 不支持 | 不得生成或放行 |

## 强制门禁

1. `DATETIME`、`DATETIMEV2` 生成 `local_datetime`；`TIMESTAMP` 及带时区变体生成 `instant`。`datetime` 仅作为历史兼容别名读取，不能作为新 DSL 的首选输出。
2. `date`、`local_datetime`、`instant` 只能绑定 `TYPE_TIME`；只有 `in` 允许数组参数并绑定对应的 `TYPE_TIME_ARRAY`。`not_in` 和 `between` 不是 relational-query v1 操作符。
3. `integer`、`long`、`decimal` 只能绑定 `TYPE_NUMBER`；只有 `in` 允许数组参数并绑定 `TYPE_NUMBER_ARRAY`。
4. `string` 和 `boolean` 绑定 `TYPE_STRING`；数组操作绑定 `TYPE_STRING_ARRAY`。
5. 类型证据必须同时包含字段数据库类型、DSL `logicalType`、参数名和参数 `TYPE_*`；时间字段还必须有 `typeContext.timezone` 或 `sessionTimezone`。`TIMESTAMP → instant` 缺少时区证据时，门禁失败，不允许猜测或放行。
6. 失败诊断必须包含字段、参数、期望类型和实际类型，便于定位是 DDL、DSL 还是 MetricView 参数配置不一致。

## 运行时约束

- 后端 JDBC 元数据适配器也必须遵守同一映射，尤其是把 `Types.TIMESTAMP` 返回为 `instant`，把 `DATETIME`/`DATETIMEV2` 返回为 `local_datetime`。
- 关系 DSL 的固定枚举、区域类型和技术类型也属于参数值：过滤条件使用 `parameter` 并在 `dsl.parameters` 提供值，不使用 `where[].value`。`value` 在当前编译器中会按字段引用处理，可能误报 `UNKNOWN_FIELD`。
- 覆盖配置只能声明受控映射，不能通过 Python 代码、样例值或前端输入绕过门禁。
- 只有类型门禁通过后，才允许调用指标视图远程 `test` 或 `save`。
