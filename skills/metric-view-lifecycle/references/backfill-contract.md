# 指标视图回填契约

## 创建

- 先调用 `queryList` 做名称/语义去重；没有同类视图才创建。
- UI/接口字段必须全部有来源：名称、说明、状态、类型、来源、匹配问题、函数名、只读 operation、参数、返回定义、逻辑说明和 Python 代码。`domainId` 来自当前可信 Token/会话上下文，不要求用户重复填写。完整结构以 [`metric-view-definition.schema.json`](schemas/metric-view-definition.schema.json) 和 [`metric-view-interface-contract.md`](metric-view-interface-contract.md) 为准。
- 只要函数声明参数或 DSL 条件包含字段类型，就必须同时提交 `typeContext`：`fields` 登记 DDL/JDBC 类型，`predicates` 登记字段、操作符、参数名和 DSL `logicalType`。该证据供类型兼容门禁使用，不能用样例值替代。
- `origin`、只读 operation、返回字段别名和参数名必须符合现有 MetricView 结构。

## 更新

- 通过 `queryById` 读取完整对象，保留原 `id`、`function.id`、`domainId`、`origin` 和未修改字段；不能用候选请求体中的 `domainId` 覆盖身份上下文。更新定义没有稳定 `id` 时，contract gate 必须在远程请求前阻断。
- 只替换需求明确改变的参数、DSL/Python、返回定义或说明；不能把未加载字段写成空值。
- 保存后重新查询并比较稳定字段，确认没有误删或降级。
- 更新保存前再次 `queryById` 比较 `id`、`function.id`、`version/updatedAt` 和未修改字段；出现差异返回 `UPDATE_CONFLICT` 并停止保存，不自动三方合并。详见 [`update-conflict-policy.md`](update-conflict-policy.md)。

## 类型证据示例

```json
{
  "function": {
    "parameters": [{"name": "start_time", "type": "TYPE_TIME"}]
  },
  "typeContext": {
    "fields": {"outage.start_time": "TIMESTAMP"},
    "predicates": [{
      "field": "outage.start_time",
      "operator": "gte",
      "parameter": "start_time",
      "logicalType": "instant"
    }]
  }
}
```

`TIMESTAMP` 必须写成 DSL `instant`，`DATETIME/DATETIMEV2` 必须写成
`local_datetime`，参数均使用 `TYPE_TIME`。只有 `in` 使用对应的 `TYPE_*_ARRAY`；
时间窗口使用 `gte` 加 `lt` 表达左闭右开区间，`not_in` 和 `between` 不属于当前
relational-query v1。类型证据缺失或不一致时，helper 在远程 `test` 前阻断，不会进入保存流程。

## 安全顺序

`test → 用户确认回填 → save(PUBLISHED) → queryById 复核`。Skill 只有在四个阶段都成功时才报告完成；保存请求默认直接设置 `PUBLISHED`，但任何测试失败都不得保存或发布。

测试阶段必须通过接口完成 ReAct：调用 `POST /metricView/test`，读取结构化失败后按证据修复候选定义，最多 3 轮，再进入用户确认。不得通过页面控制触发测试，也不得在接口失败后直接调用 `save`。

`queryList` 请求体固定为 `{"name":"..."}`，`queryById` 固定为 `{"id":"..."}`；`test` 和 `save` 直接提交完整定义，`testExecute` 固定包裹为 `{"metricView": <定义>, "param": <参数>}`。helper 在 `urllib` 调用前执行同一份 contract gate，失败时远程调用数为零。

多指标默认按最终输出 Schema 拆成多个 MetricView；只有参数、粒度、权限和返回语义完全一致时才允许共享一次只读 DSL 查询，仍分别测试、保存和复核。详见 [`multi-metric-policy.md`](multi-metric-policy.md)。

## 可执行 helper

需要实际调用管理接口时，使用 `scripts/backfill_metric_view.py <definition.json>`。基础地址默认是 `http://10.100.31.37:3000/api/data-query`，可以通过 `--base-url` 提供覆盖；Token 始终通过隐藏输入获取，不放在命令行、文件、环境变量或日志中。helper 会按名称去重，更新时递归保留原对象的 `id`、`function.id` 和未修改字段，测试失败或用户不输入 `yes` 时不会调用保存接口；保存请求默认设置为 `PUBLISHED`，保存后一定通过 `queryById` 复核最终状态，复核失败不能报告成功。`--publish` 仅为旧调用兼容参数。
