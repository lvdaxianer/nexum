# 接口清单

所有接口都以部署实例的服务地址为基准。页面内测试使用当前登录会话；页面外自动化调用才使用运行时变量 `REQUEST_TOKEN` 对应的 `X-Trusted-Token: <token>`。默认 API 基础地址为 `http://10.100.31.37:3000/api/data-query`，其他环境通过 `--base-url` 覆盖；实际 Token 只保存在受控运行时上下文内。每条外部 Token 的 `domainId`、`userId` 和路径范围由服务端配置绑定并校验，不从 Token 本地解码，也不能跨 Token 复用范围。

| 方法 | 路径 | 用途 | 允许的副作用 |
|---|---|---|---|
| GET | `/runtime-variables/catalog` | 获取模型可见的变量元数据，不返回具体值 | 无 |
| POST | `/metricView/queryList` | 查询当前域已有指标视图 | 无 |
| POST | `/metricView/queryById` | 查询单个指标视图的完整定义 | 无 |
| POST | `/metricView/test` | 通过 HTTP 测试候选指标视图，不持久化；失败时返回 `errorCode`、安全 `message`、结构化 `details`、`traceId` | 无 |
| POST | `/metricView/save` | 创建或更新指标视图 | 仅在用户确认回填后 |
| POST | `/dsl/execute` | 旧本体 DSL 执行入口 | 只读查询 |
| POST | `/metricView/dsl/execute` | 统一结构化 DSL，支持本体、非本体和混合查询 | 只读查询 |

请求体字段、裸定义与包装体的精确定义见 [`metric-view-interface-contract.md`](metric-view-interface-contract.md)。任何 `test`、`testExecute` 或 `save` 请求都必须先通过 `scripts/metric_view_contract.py`；本地契约失败时不得产生远程请求。

接口边界：本清单没有数据库写入接口。`/metricView/save` 只保存指标视图定义，是已登记的业务管理接口；不得把它扩展为业务数据写入。新增、修改或删除业务数据必须先有明确登记的业务 API，否则停止并向用户索取接口信息。

测试观察必须区分 DSL 中间响应和最终输出响应：成功结果的最终 `answer[*]` 字段必须与 `function.returnDef.outKeyRefs[*].key` 一致；字段不一致时，`details` 应包含 `stage`、`expectedKeys`、`actualKeys`、`missingKeys`、`unexpectedKeys` 和可选 `rowIndex`。即使 HTTP 状态为 200，只要存在业务 `errorCode` 或输出契约失败，都视为测试失败，不能保存或发布。

执行路由：

- 全部来源是本体：使用 `/dsl/execute`。
- 存在任意非本体来源，包含本体与非本体混合：使用 `/metricView/dsl/execute`。
- 新 DSL 适配器不存在时必须保留明确错误，不得退回 SQL 或账号密码连接。

页面注册接口的 REST 资源是 `/runtime-variables`：`POST` 创建、`PUT /{id}` 更新、`PATCH /{id}/enabled` 启停；Skill 只读目录，不替页面写入变量。

Skill 的测试调用必须直接使用上述 HTTP 接口，不得操作页面 DOM、点击页面按钮或把页面会话当作 Skill 的隐式测试结果。页面内测试复用登录会话属于产品功能；页面外 Skill 使用受控 `X-Trusted-Token`，没有该上下文时按执行模式切换到合成测试。

统一关系 DSL 的表权限默认由服务端 `table-scope=all` 控制，收窄时使用 `table-scope=list` 与 `allowed-tables`。字段默认通过 Dinghai 专用数据源元数据解析；`tables.<logical>.columns` 只是别名/类型覆盖，不能作为必须逐项登记的字段白名单。`domainId` 仍来自可信会话或 Token 绑定。
