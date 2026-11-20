# MetricView Lifecycle Skill

当前 Skill 契约版本：`0.1.0`；DSL 绑定：`relational-query` v1。DSL engine 文档/Schema 与 Skill 快照的来源、SHA-256 和核验日期见 [contract-manifest.yaml](references/contract-manifest.yaml)，可运行 `python3 scripts/check_contract_drift.py` 检查漂移。

这个 Skill 根据业务需求、已登记的 DDL 和本体/非本体分类，完成指标视图发现、生成、测试、ReAct 修复、空结果结构回退、保存和复核。

## 在 Headless Core 中的边界

该 Skill 是可注册的领域能力包：Core 负责发现、契约校验、权限门禁、上下文注入和调用事件；本目录负责指标视图生命周期的领域规则、参考资料和本地验证脚本。Skill 不绕过 Core 直接执行未登记的工具、数据库写操作或权限决策。

## 安装

安装时必须复制整个 `metric-view-lifecycle` 目录，不能只复制 `SKILL.md`；`references/`、`scripts/` 和 `evals/` 是运行和验证所需的配套内容。

### 1. 选择 Skill 目录

把 Skill 安装到当前 AI 工具实际加载的全局目录：

| 使用环境               | 目标目录示例                     |
| ---------------------- | -------------------------------- |
| Codex/Agent skill root | `/Users/<用户名>/.agents/skills` |
| Claude Code            | `/Users/<用户名>/.claude/skills` |
| Codex CLI              | `/Users/<用户名>/.codex/skills`  |
| 仅当前项目使用         | `<项目根目录>/.claude/skills`    |

如果不确定当前工具使用哪个目录，先查看已有 Skill 的位置；不要同时复制到多个目录，以免加载到不同版本。

### 2. 从本地仓库复制

假设当前仓库目录为 `/path/to/skills`，将路径替换成实际绝对路径：

```sh
REPO_ROOT="/path/to/skills"
TARGET_SKILL_ROOT="/Users/<用户名>/.agents/skills"
TARGET_SKILL="$TARGET_SKILL_ROOT/metric-view-lifecycle"

test -f "$REPO_ROOT/metric-view-lifecycle/SKILL.md"
test ! -e "$TARGET_SKILL" || {
  echo "目标已存在，请先检查版本和来源：$TARGET_SKILL"
  exit 1
}

mkdir -p "$TARGET_SKILL_ROOT"
cp -R "$REPO_ROOT/metric-view-lifecycle" "$TARGET_SKILL_ROOT/"
```

目标目录已经存在时，不要直接覆盖；先比较 `SKILL.md`、`references/contract-manifest.yaml` 和版本，再决定复用、备份或由用户确认升级。

### 3. 开发时使用软链接（可选）

如果需要持续修改仓库中的 Skill，可以使用软链接。仅在目标路径不存在时执行：

```sh
REPO_ROOT="/path/to/skills"
TARGET_SKILL_ROOT="/Users/<用户名>/.agents/skills"

test ! -e "$TARGET_SKILL_ROOT/metric-view-lifecycle"
ln -s "$REPO_ROOT/metric-view-lifecycle" "$TARGET_SKILL_ROOT/metric-view-lifecycle"
```

### 4. 安装后验证

验证 Skill 文件和 DSL 快照是否完整：

```sh
TARGET_SKILL_ROOT="/Users/<用户名>/.agents/skills"
SKILL_ROOT="$TARGET_SKILL_ROOT/metric-view-lifecycle"

test -f "$SKILL_ROOT/SKILL.md"
test -f "$SKILL_ROOT/references/metric-view-interface-contract.md"
test -f "$SKILL_ROOT/references/schemas/metric-view-definition.schema.json"
test -f "$SKILL_ROOT/references/dsl-syntax.md"
test -f "$SKILL_ROOT/scripts/backfill_metric_view.py"

cd "$SKILL_ROOT"
python3 scripts/check_contract_drift.py
for test_file in scripts/test_*.py; do
  PYTHONPATH=scripts python3 "$test_file" || exit 1
done
```

看到漂移检查返回 `{"ok": true, ...}` 且测试全部通过后，再重启或重新加载 AI 工具，使它发现新 Skill。若漂移检查失败，说明 DSL engine 与 Skill 快照版本不一致，应先更新同一版本的文档和 Schema，不要跳过检查。

### 5. 从已安装目录升级

升级前保留旧目录或使用 Git 记录版本；确认新版本来源后，将新的完整目录复制到临时目录，验证通过后再替换目标目录。升级后必须重新运行第 4 节的漂移检查和全量测试。

本 Skill 不要求把 MySQL 凭据、Token 或真实业务数据写入安装目录；安装包中的 Token 文件只是示例模板，不能填入真实值。

## 使用前提

1. DDL 默认放在 `references/ddl/`，也可以由用户提供单个 `.sql` 文件或目录。DDL 可以混合本体与非本体，但每个文件必须通过 catalog、文件头标记或显式分类目录给出分类；不能按表名猜测。
2. DDL 默认只作为参考。每次生命周期操作默认必须先询问 MySQL 地址、端口、数据库/Schema、只读账号、密码、允许核验的表范围和测试范围；只有用户在需求中明确写明不需要 MySQL 核验，且归档为 `ddl_asserted_consistent` 或 `synthetic_unverified`，才可跳过。未明确豁免时必须暂停，不能生成 DSL/Python、调用 `test`/`save` 或发布；真实模式查询 `information_schema` 并以 MySQL 元数据为准核对。
3. 页面内调用管理接口时复用当前登录会话，不要求用户再次输入 Token。页面外自动化调用才使用运行时变量 `REQUEST_TOKEN` 对应的 `X-Trusted-Token`。Token 是不透明凭据：Skill 不尝试从 Token 推算 `domainId`，服务端按每条可信 Token 的哈希、用户、业务域和路径绑定逐条校验；缺少页面会话时不能用页面输入框临时补 Token。
4. 运行时地址和 Token 不写死在 Python 中。模型生成 `__request_path`、`__request_token` 等占位符，执行前由注册表元数据和可信运行时来源解析到临时文件，执行结束立即清理。

可信 Token 的服务端绑定模板见 [trusted-token-runtime.example.yaml](references/trusted-token-runtime.example.yaml)。部署时只配置服务账号和目标 `domain_id`，实际 Token/hash 由 Secret Manager 或部署注入提供；不能把示例中的占位符替换后提交到 Git。

## 执行顺序

默认询问 MySQL 门禁 → 需求理解 → DDL 映射 → MySQL 元数据核验或明确豁免声明 → 类型映射 → 读取变量目录和已有指标视图 → 选择真实只读数据/明确授权的合成结构模式 → 生成结构化 DSL/Python → Coding Gate → 接口测试 → 用户确认 → 创建或更新 → 保存后复核。

全部本体对象走旧 DSL；只要包含非本体对象，或本体与非本体混合，走统一指标视图 DSL 接口。默认先询问 MySQL 只读连接信息；未明确豁免时，缺少连接信息必须暂停并反问，不能生成 DSL/Python、测试、保存或发布。只有用户明确保证 DDL 与 MySQL 元信息一致，或明确选择未验证合成测试时，才可跳过实时核验，并分别标记 `ddl_asserted_consistent` 或 `synthetic_unverified`。Skill 严禁直连数据库执行写 SQL/DDL 或为了测试造数；业务数据新增、修改、删除只能调用接口清单中明确登记的业务 API。

路由规则也有可执行校验：`python3 -m unittest skills/metric-view-lifecycle/scripts/test_route_policy.py`，本体、非本体和混合来源分别覆盖旧接口与统一接口。

完整本地组合链路可运行：`python3 -m unittest skills/metric-view-lifecycle/scripts/test_workflow_smoke.py`，覆盖变量目录、运行时占位符注入后的 Python 执行、`testExecute`、MetricView `test → save → queryById`；该测试只使用本地模拟服务。

合成边界样例可运行：`python3 -m unittest skills/metric-view-lifecycle/scripts/test_synthetic_cases.py`，验证重复行去重、成功空结果生成 schema-compatible mock，以及权限/业务错误不会伪造成功响应。

## 变量注册约定

变量注册页位于后台管理的 `/admin/global-variables`，只保存元数据：名称、占位符、含义、能力、使用时机、来源、类型、是否必填、是否敏感、作用域、解析器键和启用状态。具体 Token、数据库密码等值不进入注册表；页面启停操作在服务端成功后才更新状态，并阻止重复提交。

已开放的变量目录接口为 `GET /runtime-variables/catalog`；管理接口为 REST 风格的分页、创建、更新和启停接口，完整约束见 `references/interface-catalog.md`。

## 实际回填

模型生成候选 MetricView JSON 后，可以使用 helper 执行安全回填：

```bash
python3 scripts/backfill_metric_view.py ./metric-view-definition.json
```

默认地址为 `http://10.100.31.37:3000/api/data-query`；其他环境用 `--base-url` 覆盖。页面内测试使用当前登录会话；页面外 helper 才通过隐藏输入或受控运行时上下文提供范围明确的外部 Token，不放入命令行。

页面外 helper 会要求交互式输入 `X-Trusted-Token`，先按名称查询候选、再调用 `test`；只有用户输入 `yes` 后才调用 `save`，保存请求默认设置为 `PUBLISHED`，最后通过 `queryById` 复核最终状态。Token 不出现在命令行、定义文件、日志或输出摘要中。未提供 `id` 时按名称唯一匹配：零条创建、一条更新，多条停止并要求提供明确 ID。页面内测试不走 helper 的外部 Token 输入流程。

候选定义至少需要 `name` 和 `function`；生成时还应补齐 `description`、`status`、`type`、`matchQuestions`、`function.parameters`、`function.returnDef`、`function.logic` 和 `function.code` 等页面字段。`domainId` 不要求用户重复填写，也不作为请求体中的可信身份来源：创建由当前 Token/会话绑定的域决定，更新保留服务端原对象的 `domainId`。保存成功后默认自动设置为 `PUBLISHED`，测试失败时不保存。

## 验证

```bash
python3 scripts/validate_metric_view_python.py <generated.py> --variables references/runtime-variables.yaml
python3 scripts/validate_metric_view_python.py <generated.py> --variables references/runtime-variables.yaml --return-def <return-def.json>
python3 scripts/validate_metric_view_output.py --return-def <return-def.json> --result <metric-view-result.json>
python3 scripts/run_synthetic_test.py evals/fixtures/valid_metric_view.py
for test_file in scripts/test_*.py; do
  PYTHONPATH=scripts python3 "$test_file" || exit 1
done
```

代码门禁不是只读提示：回填 helper 会在远程 `test` 前重复执行 [coding-gate.md](references/coding-gate.md) 的全部校验。作者/日期、多行文档、分支注释、注释比例、规模/复杂度、命名、参数、魔法值、未使用声明、敏感信息、参数化 DSL、limit、循环远程调用、日志、异常链、timeout/deadline、严格 `data/answer` 响应、`returnDef` 输出字段映射和 stdout 边界任一失败，都会阻止 `test` 和 `save`。接口业务错误即使 HTTP 状态为 200 也不能视为通过。

真实数据库测试可使用用户提供或授权安全运行时输入的只读凭据和限定范围；凭据不会进入模型输出、脚本、日志、截图或提交物。真实库没有匹配记录时，保留真实空结果证据，并仅在最终返回边界生成符合返回契约的 Mock；不得生成源表记录、写库或把 Mock 报告为真实业务数据。类型规则见 [类型映射](references/type-mapping.md)。

表权限默认采用固定 Dinghai 数据源内的 `table-scope=all`，需要收窄时使用 `table-scope=list` 与 `allowed-tables=[a,b]`；字段默认 `all`，`tables.<logical>.columns` 仅用于逻辑别名、物理列名和类型覆盖，不是字段白名单。完整边界见 [表范围策略](references/table-scope-policy.md)。
