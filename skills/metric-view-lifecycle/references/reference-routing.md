# 参考资料最小读取路径

`SKILL.md` 只要求先读核心对象、接口、执行模式和 DSL 边界；其余资料按场景读取，避免把 Token 模板、DDL 目录和错误矩阵在每个小改动中重复加载。

## 所有生命周期操作的核心

- `references/metric-view-interface-contract.md`
- `references/schemas/metric-view-definition.schema.json`
- `references/execution-modes.md`
- `references/blocking-contract.md`
- `references/backfill-contract.md`
- `references/output-contract.md`
- `references/coding-gate.md`
- `references/contract-manifest.yaml`，并运行 `scripts/check_contract_drift.py`

## 新建指标视图

在核心路径上增加：`ddl-catalog.md`、`metadata-verification.md`、`type-mapping.md`、`time-semantics.md`、`dsl-syntax.md`、`metric-view-dsl-binding.md`、`python-contract.md`、`test-matrix.md`、`react-loop.md` 和 `operation-boundary.md`。涉及页面外自动化时才读取 `runtime-variables.yaml` 和 `trusted-token-runtime.example.yaml`。

## 仅更新参数或说明

读取 `metric-view-interface-contract.md`、`backfill-contract.md`、`update-conflict-policy.md`、`output-contract.md` 和 `execution-modes.md`。只有参数类型或 DSL 改变时再读 `type-mapping.md`、`time-semantics.md` 和 DSL 快照；只有代码改变时再运行 Coding Gate。

## 仅做未验证合成测试

读取 `blocking-contract.md`、`execution-modes.md`、`dsl-syntax.md`、`metric-view-dsl-binding.md`、`python-contract.md`、`output-contract.md`、`coding-gate.md`、`test-matrix.md` 和本地合成服务说明。不要读取或索取 MySQL 凭据；不要把 `trusted-token-runtime.example.yaml` 当作必读文件。

## 混合数据源

增加 `ddl-catalog.md`、`table-scope-policy.md`、`type-mapping.md`、`metadata-verification.md`、`dsl-syntax.md` 和 `metric-view-dsl-binding.md`，确认本体/非本体路由与权限范围。若只做合成验证，使用 `synthetic_unverified`，不读取真实凭据。

## 更新已有视图

增加 `interface-catalog.md`、`update-conflict-policy.md`、`backfill-contract.md`、`react-loop.md` 和 `error-code-matrix.md`；先 `queryById`，保存前二次读取并检查冲突。批量、多指标场景再读取 `multi-metric-policy.md`。
