# DDL 目录

Skill 不接收对话中直接粘贴的 DDL。默认读取 `references/ddl/`，也接受用户明确提供的单个 `.sql` 文件或目录。一个目录可以同时包含本体和非本体 DDL；分类必须有明确证据，使用下面任一种方式。

```text
references/ddl/*.sql
references/ddl/ontology/*.sql       # 兼容既有显式目录
references/ddl/non-ontology/*.sql  # 兼容既有显式目录
```

登记格式：

| 文件 | 分类 | 数据库/Schema | 逻辑表 | 备注 |
|---|---|---|---|---|
| `ddl/example.sql` | `ontology` 或 `non_ontology` | `data_transform` | `/dim_example` 或 `example` | 示例，替换为真实文件 |

混合目录也可以使用机器可读的 `ddl-catalog.json`：

```json
{
  "files": [
    {"file": "ontology.sql", "classification": "ontology"},
    {"file": "business.sql", "classification": "non_ontology"}
  ]
}
```

没有 catalog 时，在每个 SQL 文件前 20 行加入以下标记之一：

```sql
-- ontomato: ontology
-- ontomato: non_ontology
```

规则：

- 本体 DDL 以本体类、关系类和属性映射为准；非本体 DDL 以物理表和列为准。
- 一个查询如果引用至少一张非本体表，就不能走只读本体 DSL。
- DDL 只能用于字段、类型、主键、关系和可查询能力分析；不能把 DDL 中的账号密码带入生成代码，也不能据此生成写 SQL、种子数据或数据库变更操作。
- 路径不存在、目录为空、文件不可读或分类缺失时，必须向用户询问 DDL 路径/分类，不猜测。
- 可以运行 `python3 scripts/ddl_discovery.py <ddl-path> [--catalog <catalog.json>]` 检查来源；失败只表示需要补齐输入，不得继续生成代码。
