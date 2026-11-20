# Coding 与测试子 Skill

先执行 Coding Gate，再按执行模式测试：真实数据模式直接调用 `POST /metricView/test`，执行 `Plan → Execute → Observe → Repair`，最多三轮；合成结构模式也必须通过 HTTP 合成服务验证同一闭环，不得用页面点击代替接口测试。

- Coding Gate 失败时不得调用 testExecute 或 save。
- Coding Gate 必须检查函数文档和 20 行上限、循环远程调用、命名 timeout、整体 monotonic deadline、data/answer 的严格响应结构，以及 `returnDef.outKeyRefs → OUTPUT_KEYS → answer[*]` 的最终字段契约。
- 回填 helper 必须复用与命令行校验器相同的规则，不能只在人工审查中检查。
- 用户提供或授权安全运行时输入只读数据库凭据时进入真实模式；无凭据且未明确豁免时返回 `blocked`，只有用户明确选择 `synthetic_unverified` 才使用本地合成服务。
- 真实库无匹配数据时，保留真实空结果证据，仅在最终返回边界使用符合返回契约的 Mock；不得写库或生成源表 Mock 行，并明确拆分报告。
- 数据库访问严格只读：禁止导入数据库驱动、执行写 SQL/DDL、插入/修改/删除测试数据；业务变更只能调用接口清单中明确登记的业务 API。
- 每轮记录测试模式、请求路由、参数类型、响应摘要、修复依据和残余风险；不得记录凭据或完整业务数据。
- `success=false`、`errorCode`、`details` 和 `traceId` 是可观察业务结果；输出契约错误必须解析 expected/actual/missing/unexpected 字段并决定 Repair 或停止，不能把完整 traceback 转交用户。HTTP 200 但带业务 `errorCode` 仍然是测试失败。
- 没有可解释诊断的 HTTP/传输失败不得盲目修复；记录 `traceId` 或请求边界证据后停止或切换合成模式。
