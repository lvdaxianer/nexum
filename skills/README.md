# skills

`skills/` 是项目级 Skill 注册目录。Skill 把领域流程、参考资料、脚本和评测用例组织成可发现、可校验、可授权调用的能力单元。

## 目录职责

- 每个 Skill 使用一个独立目录，入口通常是 `SKILL.md`。
- `references/` 保存领域参考资料和契约快照。
- `scripts/` 保存漂移检查、生成和自动化验证脚本。
- `evals/` 保存评测输入、期望结果或回归样例。
- `README.md` 说明安装方式、依赖、边界和验证命令。

当前示例 Skill：[`metric-view-lifecycle`](metric-view-lifecycle/README.md)。

## 维护边界

Skill 内容由 Core 的注册、校验和权限流程控制；目录中的说明不能绕过运行时权限。安装时复制完整 Skill 目录，不要只复制 `SKILL.md`。

## 验证

每个 Skill 以自身 README 中的命令为准。`metric-view-lifecycle` 可运行：

```bash
cd skills/metric-view-lifecycle
python3 scripts/check_contract_drift.py
```
