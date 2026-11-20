# openspec

`openspec/` 是仓库内的变更规格目录，用于在实现前明确目标、设计取舍、任务拆分和验收状态。

## 目录职责

- `changes/<change-id>/proposal.md`：说明问题、目标和影响范围。
- `changes/<change-id>/design.md`：记录架构方案、边界、风险和替代方案。
- `changes/<change-id>/tasks.md`：记录可执行任务及完成状态。
- `changes/archive/`：保存已完成变更的历史规格。
- `config.yaml`：仓库级 OpenSpec 配置。

## 使用方式

创建或继续变更时，先阅读对应变更目录内的文档；完成实现后运行：

```bash
bunx openspec validate <change-id> --strict
bunx openspec status --change <change-id>
```

## 维护边界

OpenSpec 是设计与交付记录，不是运行时配置。实现变更必须同步代码、测试和 README；不要把密钥、真实凭据或临时机器路径写入规格文档。
