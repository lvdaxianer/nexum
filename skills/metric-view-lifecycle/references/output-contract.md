# 最终输出契约与自动修复

## 唯一事实来源

指标视图有两层结构，不能混用：

1. **查询层**：DDL、MySQL 元数据和 DSL `data` 中的字段。它们只负责查到中间行、确认类型和建立映射。
2. **输出层**：需求明确的目标返回结构，以及已存在视图的 `function.returnDef.outKeyRefs`。它决定最终 `answer` 每行的字段名、顺序、类型和语义。

DDL 不得替代输出层定义。已存在视图更新时先以 `queryById` 返回的 `returnDef` 为准；新视图如果需求没有明确最终字段，必须补问或停止，不能从 DDL 字段名猜测。

## 统一生成算法

按以下顺序生成所有本体、非本体和混合来源的指标视图：

1. 将 `returnDef.outKeyRefs[*].key` 固化为有序 `OUTPUT_KEYS`；同时保存每个目标字段的类型、格式、粒度、聚合和来源映射。
2. 用已核验的 DDL/MySQL 元数据生成只读 DSL，查询结果只作为中间行；允许物理列名、别名和目标字段名不同。
3. 在最终返回边界逐行执行 `source row → target row` 映射。映射后的每行字段集合必须严格等于 `OUTPUT_KEYS`，不能缺字段、加字段或把 DSL 的 `data` 包裹层直接透传。
4. stdout 只输出 `{"answer": [...]}`。`data` 只能在解析 DSL 响应的内部阶段出现，不能成为 `answer[*]` 的业务字段，除非它本身就是需求明确的目标字段。
5. 远程查询成功且 `answer=[]` 时，才在最终映射边界使用按 `OUTPUT_KEYS` 生成的 `MOCK_ANSWER`；查询错误、权限错误、字段错误、类型错误和响应包裹层错误不得 Mock。

通用不变量：

```text
set(answer[i].keys()) == set(returnDef.outKeyRefs[*].key)
```

字段集合不一致时，即使中间查询有数据，也必须失败；不能为了通过测试删除目标字段、把源表字段塞入结果或改写需求。

## 诊断格式

本地输出校验器和接口观察都应尽量形成以下安全结构；字段名可以扩展，但不能只返回一个空的通用错误：

```json
{
  "ok": false,
  "errorCode": "METRIC_VIEW_OUTPUT_SCHEMA_MISMATCH",
  "stage": "OUTPUT_SCHEMA_VALIDATE",
  "message": "最终 answer 行字段必须严格等于 returnDef.outKeyRefs",
  "rowIndex": 0,
  "expectedKeys": ["date", "complaints", "daily_average"],
  "actualKeys": ["data"],
  "missingKeys": ["complaints", "daily_average", "date"],
  "unexpectedKeys": ["data"],
  "traceId": "..."
}
```

诊断只能包含字段名、类型、阶段、行号、数量和 traceId 等安全元数据；不得输出 Token、密码、完整请求体、完整业务行或完整 traceback。服务端只返回通用 `METRIC_VIEW_EXECUTION_FAILED` 且 `details` 为空时，Skill 必须保留 `traceId`，并在有权限读取服务日志的环境中按 traceId 查找真实异常；不能把空 details 当成“没有错误”，也不能盲目换字段。

## ReAct 自修复规则

`OUTPUT_SCHEMA_VALIDATE` 属于可解释的候选定义错误，进入最多三轮的 `Plan → Execute → Observe → Repair`：

- `expectedKeys` 与需求/`returnDef` 对账，不能改成 DDL 字段集合来迎合当前输出。
- `actualKeys` 为 `data` 时，修复最终映射和输出边界；先检查是否把 DSL 响应原样透传。
- `missingKeys` 时补齐从中间行到目标字段的映射，并核对类型、格式和聚合语义。
- `unexpectedKeys` 时移除未经目标结构声明的源字段；如果业务确实需要该字段，先更新需求或 `returnDef`，不能偷偷扩展结果。
- 修复后重新做本地静态校验和同一接口测试；没有测试成功证据不得 `save` 或发布。
- 三轮仍失败时停止，报告每轮的 `errorCode`、安全 `details`、traceId、修复动作和残余风险，让用户决定是否补充目标结构或接口诊断。

空结果不触发字段修复；只有成功的空 `answer` 才按最终输出契约生成 Mock。输出结构错误不能通过 Mock 掩盖。

## 可执行校验

先从完整定义提取 `function.returnDef`，再执行：

```bash
python3 scripts/validate_metric_view_python.py generated.py \
  --variables references/runtime-variables.yaml \
  --return-def return-def.json
python3 scripts/validate_metric_view_output.py \
  --return-def return-def.json \
  --result metric-view-result.json
```

第一个命令阻断未声明或未使用 `OUTPUT_KEYS`、字段不匹配的 Mock 和基础运行协议错误；第二个命令验证真实/合成测试保存的最终 `answer`。两个命令只做本地校验，不访问客户数据库。
