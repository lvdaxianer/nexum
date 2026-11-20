---
name: metric-view-lifecycle
description: Generate, discover, type-check, test, repair, create, update, save, and verify MetricView Python programs from business requirements using mixed DDL references, runtime variables, trusted-token context, direct API-driven ReAct testing, and schema-compatible empty-result mocks. Use this skill whenever a user asks to build, validate, debug, repair, test, save, publish, or deploy a metric view; always use registered HTTP interfaces, never control a browser page.
---

# MetricView Lifecycle 工作流

这个 Skill 用于管理指标视图全生命周期：读取项目内或用户指定的混合 DDL，发现已有指标视图，生成符合运行时协议的 Python 和结构化 DSL，经过 Coding Gate、真实/合成数据测试、接口驱动修复和空结果结构回退后，再创建或更新、保存并复核指标视图。它不接收用户直接粘贴的 DDL；DDL 必须作为文件或目录提供，并登记分类证据。

## 最高优先级门禁：默认先询问 MySQL

每次开始创建、更新、测试、保存或发布指标视图时，默认必须先询问用户 MySQL 只读核验信息，即使用户已经提供 DDL 或指标需求。必须询问：地址、端口、数据库/Schema、只读账号、密码、允许核验的表范围和测试范围。

只有当前需求明确写明“不需要 MySQL 核验”时，才允许跳过这次询问；明确豁免必须归档为以下可审计模式之一：

- 用户明确保证 DDL 与目标 MySQL 元信息一致：`ddl_asserted_consistent`，跳过实时元数据查询但不能声称已完成线上核验；
- 用户明确选择“仅做未验证的合成测试”：`synthetic_unverified`，只验证协议、结构和代码，不证明线上结构或真实业务数据。

如果需求没有明确豁免，或“不需要”表述无法确定执行模式，必须返回 `blocked` 终态并说明所需输入，不能生成 DSL/Python，不能调用 `test`、`testExecute`、`save`，不能发布，也不能用合成测试代替 MySQL 核验。缺少凭据、连接失败或权限失败都不得自动降级；用户未继续提供信息时流程可以结束，不无限悬停。

## 必须先读的核心参考资料

- [接口清单](references/interface-catalog.md)：只使用清单中已开放的接口。
- [MetricView 定义与接口契约](references/metric-view-interface-contract.md)：定义对象字段、请求体颗粒度、响应失败判断和保存后复核。
- [MetricView Schema](references/schemas/metric-view-definition.schema.json)：机器可校验的结构约束；未被后端证据确认的枚举保持开放字符串。
- [参考资料路由](references/reference-routing.md)：按新建、更新、合成和混合数据源场景选择最小读取集合。
- [契约版本 manifest](references/contract-manifest.yaml)：记录 DSL v1 快照、Schema ID、SHA-256 和核验日期。
- [多指标策略](references/multi-metric-policy.md)：按最终输出结构拆分视图，明确可共享查询的条件。
- [更新冲突策略](references/update-conflict-policy.md)：保存前复核版本和未修改字段，冲突即停止。
- [时间语义](references/time-semantics.md)：统一 date/local_datetime/instant、时区证据和左闭右开窗口。
- [Python 协议](references/python-contract.md)：生成脚本的 argv、请求、stdout 和错误约束。
- [最终输出契约](references/output-contract.md)：目标返回结构、DDL 到目标字段映射、结构诊断和 AI 自修复。
- [Coding Gate](references/coding-gate.md)：硬性门禁；参考 code-review-spec 与 backend-reliability-guidelines。
- [执行模式](references/execution-modes.md)：可选数据库连接、真实数据优先、合成结构验证和 ReAct 分流。
- [执行模式阻断契约](references/blocking-contract.md)：`real/asserted/synthetic/blocked` 状态、必需输入和禁止动作。
- [关系 DSL 语法](references/dsl-syntax.md)：引擎拥有的 relational-query v1 请求信封、节点、操作符和时间语义；结构校验使用同目录 JSON Schema。
- [MetricView 与关系 DSL 绑定](references/metric-view-dsl-binding.md)：区分引擎 DSL 请求体、MetricView 宿主字段、执行路由和最终返回定义。
- [回填契约](references/backfill-contract.md)：创建、更新、测试、保存和复核。
- `ddl-catalog.md`、`runtime-variables.yaml`、`trusted-token-runtime.example.yaml`、`test-matrix.md`、`metadata-verification.md`、`type-mapping.md`、`table-scope-policy.md`、`react-loop.md`、`error-code-matrix.md` 和 `operation-boundary.md` 按上述路由按需读取；页面外自动化才需要 Token 模板。

## 子 Skill / 工作阶段

把下列阶段作为内部子 Skill 顺序执行，并在每个阶段留下结构化证据：

- 需求理解：[requirement-understanding.md](references/subskills/requirement-understanding.md)
- DDL 分析：[ddl-analysis.md](references/subskills/ddl-analysis.md)
- 变量与接口发现：[variable-and-interface-discovery.md](references/subskills/variable-and-interface-discovery.md)
- DSL 与 Python 生成：[dsl-and-python-generation.md](references/subskills/dsl-and-python-generation.md)
- Coding 与测试：[coding-and-test.md](references/subskills/coding-and-test.md)
- 回填与报告：[backfill-and-report.md](references/subskills/backfill-and-report.md)

1. **需求理解**：先执行“默认先询问 MySQL”门禁，再从业务描述提取指标名称、说明、入参、类型、返回字段、筛选、排序、限制、权限和期望状态。没有默认值且会影响查询或回填的字段必须反问；能从需求、DDL 或已有视图推断的内容不要重复询问。
2. **DDL 分析与元数据核验**：优先读取默认 `references/ddl/`，也接受用户指定的单个 `.sql` 文件或目录；递归发现混合 DDL，并通过 catalog、文件头 `-- ontomato: ontology/non_ontology` 或显式分类目录建立映射。DDL 只作为初始假设，不能默认视为线上事实。未出现明确 MySQL 核验豁免时，必须先取得只读连接信息和允许范围，再查询 `information_schema` 等元数据并逐项对账；发现冲突时以 MySQL 元数据为准，缺少凭据或元数据查询失败时暂停真实生成和测试。不能凭表名猜测、不能用 Mock 掩盖元数据缺口；路径不存在、目录为空或分类不明确时，也必须反问并停止生成。
3. **变量与接口发现**：先调用 `GET /runtime-variables/catalog` 获取变量语义，再按 [接口清单](references/interface-catalog.md) 查询已有指标视图和可用执行接口。`REQUEST_TOKEN` 只是运行时占位符，不是页面输入项：指标视图页面测试复用当前登录会话，由后端把会话 Token 安全地传给 Python 子进程；不得在前端弹窗要求用户再次输入 Token。外部自动化调用才使用 `X-Trusted-Token`，并且每条 Token 独立绑定 `userId`、`domainId` 和 `pathPatterns`，服务端必须按 Token 哈希、域和完整请求路径逐条校验。Token 是不透明凭据，不能在本地推算 `domainId`，不把 Token 写进 Skill、源码、日志或产物。只有运行器兼容协议需要时才注入 `REQUEST_DOMAIN_ID`，它不能作为授权来源。
4. **DSL 规划**：只生成结构化、只读 DSL，不接收或拼接任意 SQL。表范围必须遵守 [表范围策略](references/table-scope-policy.md)：缺省 `table-scope=all`，需要收窄时使用 `table-scope=list` 和 `allowed-tables=[...]`；字段缺省为 `all`，不得因为 DDL 未登记某个字段而生成逐字段白名单。关系查询必须使用引擎 v1 的 `from`、`select`、`joins`、`where`、`groupBy`、`orderBy`、`limit` 节点，不能把 `sources`、`dimensions`、`measures`、`filters`、`sort` 当作别名；操作符、逻辑类型和参数形状以 [关系 DSL 语法](references/dsl-syntax.md) 及 JSON Schema 为准。时间窗口使用 `gte` + `lt` 表达左闭右开区间，`not_in` 和 `between` 不可生成。同时生成 `typeContext.fields` 和 `typeContext.predicates`，优先使用已核验的 MySQL 类型，明确关联 JDBC 类型、DSL `logicalType` 与参数 `TYPE_*`；适配器是否支持由接口/DSL 校验结果决定。DDL/MySQL 字段是查询层证据，不是最终输出结构。
5. **Python 生成**：按 [Python 协议](references/python-contract.md) 和 [最终输出契约](references/output-contract.md) 生成完整脚本。先从需求目标结构或 `returnDef.outKeyRefs` 固化 `OUTPUT_KEYS`，再生成 DDL/MySQL 到目标字段的映射；最终 `answer` 每行字段必须严格等于 `OUTPUT_KEYS`，禁止把 DSL `data` 包裹层、源表字段或中间字段直接透传。地址和 Token 必须使用已注册占位符；默认地址是 `http://10.100.31.37:3000/api/data-query`，用户可覆盖。页面测试不要求用户填写 Token，实际会话由运行时注入；外部调用的 Token 只放在受控请求上下文。不能出现固定凭据或 `os.environ` 读取敏感值，也不能使用 `__class__` 等会被运行器误判为运行时变量的双下划线属性，异常类型统一使用 `type(exc).__name__`。所有本体对象都走旧 DSL；只要包含非本体对象，或本体与非本体混合，就走统一 `metricView/dsl/execute`。查询成功且 `answer=[]` 时，Mock 必须按最终返回定义生成；接口异常、权限失败、字段错误和响应结构错误不得进入 mock 分支。
6. **Coding Gate**：必须运行 `scripts/validate_metric_view_python.py --return-def`、`scripts/validate_metric_view_output.py` 和类型兼容校验器，并按 [coding-gate.md](references/coding-gate.md) 将 `code-review-spec` 的 Python 适用规范作为强制阻断项：作者/日期和多行文档、分支注释、注释比例、文件/类/函数规模、圈复杂度、snake_case/布尔命名、参数数量、魔法数字/字符串、未使用导入/变量、敏感信息、参数化 DSL、查询 limit、循环远程调用、第三方 DEBUG/WARN 日志、超时/deadline、异常链、stdout 边界和最终输出字段契约。类型校验必须同时核对 DDL/JDBC、DSL `logicalType` 与 MetricView `TYPE_*`；缺少类型证据或三层不一致时，任何一项失败都不能调用 `test` 或 `save`。Java 线程池、equals/hashCode、REST 服务端和前端规则必须明确标记为“不适用”，不能假装由 Python 校验器覆盖。
7. **测试模式与 ReAct**：先按 [执行模式](references/execution-modes.md)、[DDL 与 MySQL 元数据核验](references/metadata-verification.md) 和 [最终输出契约](references/output-contract.md) 判断验证状态；默认先询问 MySQL，未明确豁免时不能进入后续测试。候选定义由 Skill 直接调用 `POST /metricView/test`；已发布视图带运行参数时调用 `POST /metricView/testExecute`，不得控制页面。候选 Python 只能按路由调用 `/dsl/execute` 或 `/metricView/dsl/execute`，不能直连数据库或执行写操作。每轮必须观察 `errorCode`、`details`、`traceId`、期望字段和实际字段；出现可解释的输出结构、字段、类型或路由错误时，让 AI 基于证据修复并重新测试，最多 3 轮。只读查询成功但没有匹配数据时，只在最终返回边界使用 schema-compatible mock，不修改数据库；空结果不作为 DSL 错误修复。没有可解释诊断时保留 traceId 并停止，不盲目换字段或用 Mock 掩盖。
8. **回填与复核**：完整执行 `test → save(PUBLISHED) → queryById`；ReAct 修复循环中任何一轮测试失败都不得调用 `save`。测试成功后才允许保存，更新必须保留原指标视图 ID 及未修改字段。保存请求默认将状态设为 `PUBLISHED`，保存后重新 `queryById`，逐字段核对脚本、参数、返回定义、逻辑说明和最终状态；复核通过才报告成功。接口测试失败时绝不保存或发布。

实际需要从页面外调用管理接口时，使用 `scripts/backfill_metric_view.py <definition.json>` 编排回填；它会先对合并后的完整 MetricView 定义执行 contract gate、Coding Gate 和类型 Gate，任一 Gate 失败时不会调用远程 `test`/`testExecute`/`save`；Gate 通过后才交互式获取与目标域/路径绑定的外部 Token，并在保存前要求用户输入 `yes`。`MetricViewClient.observe_test`、`run_react_test_and_save` 和 `run_react_execute_and_save` 提供接口驱动的 `test/testExecute → save → queryById` 闭环，Repair 逻辑必须由 Skill 根据诊断证据决定；没有测试成功和保存后复核证据，不得报告成功。页面内测试不经过该外部 Token 输入流程，也不能替代 Skill 的接口测试。

## 空结果 Mock 契约

Mock 只用于“远程接口成功、响应结构合法、`answer` 为空”的结构验证。生成脚本必须把最终返回格式的 Mock 数据显式写入 Python（例如 `MOCK_ANSWER` 常量），并在最终输出边界保留清晰的空结果分支；不能只依靠聚合函数隐式产生 `null`：

```python
answer = first["answer"]
if not isinstance(answer, list):
    raise RuntimeError("answer 必须是列表")
# 仅成功空结果进入 schema-compatible mock；错误响应此前已经抛出。
if not answer:
    answer = [dict(row) for row in MOCK_ANSWER]
return answer
```

`MOCK_ANSWER` 必须以最终返回定义为准生成至少两条完整记录，优先生成覆盖时间窗口或业务维度的三条及以上记录，并使用类型正确、业务合理、彼此有变化的非空示例值。示例中的字段名也必须先替换为目标定义中的 `OUTPUT_KEYS`，不能照抄 `time/value` 或任何源表字段。不能用全零、`null`、空字符串、`unknown` 或固定默认值冒充业务数据；数值为零只有在业务语义明确允许时才可使用。不能返回源表的无关字段。对于有原始事实聚合的脚本，Mock 分支必须放在聚合完成后的最终返回边界，不能把最终目标行塞回需要源字段的中间 `summarize()`。DDL/JDBC 类型、`typeContext.fields` 和查询聚合只用于保证中间数据及最终字段类型合法；如果最终返回定义不完整，必须先补齐定义，不能猜字段。Mock 值不代表真实业务事实，报告必须注明“真实结构验证 + 合成数据”；禁止把接口异常、鉴权失败或未知字段转换成 Mock 成功。

Mock 生成必须同时读取“格式契约”和“业务语义”：格式契约包括最终字段名、类型、时间格式、粒度和数组结构；业务语义包括指标定义、单位、合理范围、枚举含义、窗口和聚合规则。数值率使用有限且在业务范围内的示例值，计数使用非负整数，金额/净增允许按业务语义使用正负值，时间点必须落在请求窗口内；无法确认语义时先报告假设或要求补充，不用 `null`、`0` 或任意字符串掩盖未知含义。

## 测试模式

- **真实模式**：默认必须先询问并取得只读数据库地址、端口、数据库/Schema、账号、密码、允许核验的表范围和测试范围；读取并核对 MySQL 元数据后启用。凭据只进入运行时连接，不进入模型上下文、DSL、Python、日志、截图或 Git；测试使用独立只读连接和超时。
- **一致性声明模式**：用户明确保证 DDL 与 MySQL 元信息一致时，可以跳过实时元数据查询，但报告必须标记 `ddl_asserted_consistent`，不能声称已完成 MySQL 实时核验。
- **合成模式**：只有用户明确选择“仅做未验证的合成测试”时启用。不能因为缺少凭据、连接失败或权限失败自动降级；报告必须标记 `synthetic_unverified`，不证明真实结构或真实业务数据。
- 不得把合成通过描述成真实数据库通过；真实模式失败时也不能静默改写为成功。
- 不得为了测试造数或修改真实数据库；业务新增、修改、删除只能调用接口清单中明确的业务 API。

## 输出清单

每次执行最后输出：需求摘要与待确认项、DDL 映射、路由决策、使用的变量占位符、生成的 Python、Coding Gate 结果、接口驱动 ReAct 各轮 Plan/Execute/Observe/Repair 证据、测试模式和真实/合成边界、创建/更新结果、保存后复核差异、是否需要用户确认发布。不要输出 Token、密码或真实连接串。

## 可执行校验

先运行：

```bash
python3 scripts/validate_metric_view_python.py <generated.py> --variables references/runtime-variables.yaml
```

合成测试环境和示例请求见 [test-matrix.md](references/test-matrix.md)。脚本只做本地验证，不会访问客户数据库。
