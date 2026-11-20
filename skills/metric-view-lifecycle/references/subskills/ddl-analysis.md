# DDL 分析子 Skill

默认读取 `references/ddl/`，也可读取需求中给出的单个 `.sql` 文件或目录。为每个查询对象建立逻辑表、逻辑列、类型、关联和本体分类映射；DDL 只作为待核对的初始假设。

- 以 `ddl-catalog.json`、SQL 文件头标记或显式分类目录中的分类为准，不根据表名猜测本体属性。
- 混合 DDL 必须逐文件分类；任一文件分类缺失就反问用户，不继续生成 DSL/Python。
- 任一字段或关联无法映射时，停止生成并报告缺口。
- 输出 `ontology`、`non_ontology` 或 `mixed` 分类，供路由子 Skill 使用。
- 默认必须先取得 MySQL 只读核验信息；只有需求明确豁免并标记 `ddl_asserted_consistent` 或 `synthetic_unverified` 时，才可跳过实时查询。
- 真实模式必须查询 MySQL `information_schema` 并逐项核对表、字段、类型、可空性、键和允许范围；未取得连接信息时不能继续生成或测试。
- DDL 与 MySQL 不一致时，以 MySQL 元数据为准，记录字段级差异并据此生成 `typeContext`；元数据查询失败或权限不足时暂停，不用合成数据掩盖缺口。
