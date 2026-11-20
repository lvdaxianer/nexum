# DDL 与 MySQL 元数据核验

DDL 不是线上结构的默认事实，只能作为字段、类型和关系的初始假设。每次生命周期操作默认必须先询问 MySQL 只读核验信息；只有用户明确保证“DDL 与 MySQL 元信息一致”或明确选择“仅做未验证的合成测试”时，才可跳过实时查询。未明确豁免时，完成 MySQL 元数据核对前不得生成、测试、保存或发布指标视图。

## 入口门禁

先向用户确认以下两种路径之一：

1. 用户明确保证 DDL 与目标 MySQL 元信息一致。记录 `ddl_asserted_consistent`，可以跳过实时元数据查询，但报告必须写明“用户声明一致，未实时核验”。
2. 用户未作保证或表示不确定。必须反问 MySQL 只读连接信息：地址、端口、数据库/Schema、只读用户名、密码、允许读取的表范围和测试范围。信息不完整时暂停真实生成和真实测试。

不能因为用户没有提供凭据就自动把任务降级为合成模式。只有用户明确选择“仅做未验证的合成测试”时，才允许进入 `synthetic_unverified`，且不得把结果描述为真实结构或真实数据验证。

## 只读元数据查询

MySQL 元数据预检使用独立、短生命周期、带超时和行数限制的只读连接，只能查询 `information_schema` 等元数据视图，例如：

- `information_schema.tables`：确认表存在和表类型；
- `information_schema.columns`：确认列名、顺序、类型、长度、精度、可空性和默认值；
- `information_schema.key_column_usage`：确认主键、唯一键和外键关联；
- `information_schema.statistics`：在需要时确认索引和键列。

禁止在预检连接中执行业务数据写入、DDL、种子 SQL 或任何修改数据的语句。凭据只能进入受控运行时上下文，不得写入模型输出、Skill 文件、DSL、生成的 Python、参数文件、日志、截图或 Git。生成的指标视图 Python 仍禁止导入数据库驱动；预检连接与生成代码是两个边界。

## 对账规则

至少逐项对账：表是否存在、字段是否存在、物理类型与 JDBC 类型、长度/精度、可空性、主键/外键和允许的表范围。结果保存为结构化证据：`ddl`、`mysql_metadata`、`match`、`mismatch`、`authority`。

- 无差异：`authority=mysql_metadata`，继续生成并测试；
- 有差异：`authority=mysql_metadata`，以 MySQL 元数据修正 `typeContext`、DSL 字段和参数绑定，并向用户列出字段级差异；
- MySQL 表/字段不存在或权限不足：不能猜测、不能用 Mock 掩盖，暂停并报告明确的表、字段、权限或连接问题；
- MySQL 元数据查询失败：不能静默改成真实通过。用户未明确选择合成验证时，流程保持阻断。

## 结果标记

每次报告必须标注以下一种状态：

- `mysql_verified`：已查询 MySQL 元数据并以其为准；
- `ddl_asserted_consistent`：用户明确保证一致，但没有实时查询；
- `synthetic_unverified`：用户明确选择仅做合成验证，未验证 MySQL。
