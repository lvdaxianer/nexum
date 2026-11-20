# DSL 与 Python 生成子 Skill

先确定最终输出契约，再生成结构化 DSL 和遵守 Python 协议的脚本。

- 需求目标结构或已有 `function.returnDef.outKeyRefs` 是最终输出的唯一来源；DDL/MySQL 只提供查询字段和类型证据。
- 先生成有序 `OUTPUT_KEYS` 和“中间字段 → 目标字段”的映射表，再生成查询 DSL。目标字段可以是计算、重命名、聚合或组合字段，不能要求它与源表字段同名。
- 最终边界必须逐行校验 `set(row.keys()) == set(OUTPUT_KEYS)`；DSL 返回的 `data`、内部别名和源表字段只能停留在中间层。

- DSL 只允许结构化表引用和参数，不接受原始 SQL。表权限默认是固定 Dinghai 数据源内的 `all`，可用 `table-scope=list` 和 `allowed-tables=[a,b]` 收窄；字段默认 `all`，不能把 DDL 字段目录误写成字段白名单。
- `tables.<logical>.columns` 只表示逻辑别名、物理名和类型覆盖；未登记字段由后端从专用数据源元数据解析。`domainId` 仍来自服务端可信上下文，不能由请求体或 DSL 自行声明权限。
- 全本体查询走旧 `/dsl/execute`；包含非本体对象时走统一 `/metricView/dsl/execute`。
- 关系 DSL 的固定筛选值也必须参数绑定：条件统一使用 `parameter`，对应值放进 `dsl.parameters`；禁止在 `where` 条件中使用 `value`。当前编译器会把 `value` 按字段引用解析，容易产生 `UNKNOWN_FIELD` 或 `FIELD_NOT_ALLOWED`。
- 地址、Token 等运行时值只写注册表占位符；默认地址为 `http://10.100.31.37:3000/api/data-query`，脚本固定使用 `userId`、`domainId`、`parameterFilePath` 三个运行参数。请求体中的 `domainId` 仅为兼容字段，不能用于授权判断。
- 每个带参数或字段条件的候选定义必须生成 `typeContext`：`fields` 使用 DDL/JDBC 原始类型，`predicates` 使用字段、操作符、参数名和规范化后的 DSL `logicalType`。关系 DSL 必须遵守 [`dsl-syntax.md`](../dsl-syntax.md) 及其 JSON Schema：时间字段按 DDL 选择 `date`、`local_datetime` 或 `instant`，不能生成 `timestamp`；只有 `in` 使用数组参数，`not_in` 和 `between` 不可生成。参数类型必须与 `TYPE_TIME`、`TYPE_NUMBER`、`TYPE_STRING` 及其数组类型匹配。
- Mock 和真实结果都必须经过同一个最终字段映射；成功空结果才允许使用按 `OUTPUT_KEYS` 生成的 Mock。字段契约错误必须保留 `expectedKeys/actualKeys/missingKeys/unexpectedKeys`，交给 ReAct 修复，不能降级为 Mock。
- 生成完成后先运行类型兼容校验器；类型证据缺失时停止生成/测试并要求补充 DDL 或元数据，不能依据参数名、样例值或字段名猜测。
