# skills

`skills/` 是项目级 Skill 注册目录。Skill 把领域流程、参考资料、脚本和评测用例组织成可发现、可校验、可授权调用的能力单元。

## 目录职责

- 每个 Skill 使用一个独立目录，入口通常是 `SKILL.md`。
- `references/` 保存领域参考资料和契约快照。
- `scripts/` 保存漂移检查、生成和自动化验证脚本。
- `evals/` 保存评测输入、期望结果或回归样例。
- `README.md` 说明安装方式、依赖、边界和验证命令。

仓库不内置具体业务 Skill。宿主可以通过 `skillRoots` 配置一个或多个外部 Skill 目录。

## 维护边界

Skill 内容由 Core 的注册、校验和权限流程控制；目录中的说明不能绕过运行时权限。安装时复制完整 Skill 目录，不要只复制 `SKILL.md`。

## 验证

每个 Skill 以自身 README 中的命令为准。Registry 的通用发现、校验、注册、权限和激活能力由 Nexum Core 测试覆盖。
