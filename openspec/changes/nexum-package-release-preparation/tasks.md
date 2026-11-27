# Tasks

## 1. 参数化发布准备入口

- [x] 1.1 先在 `packages/nexum-test` 增加统一准备入口的失败测试，覆盖版本/tag 传入、manifest/tarball 产物和不执行发布；以测试在入口尚未实现时失败作为 RED 证据
- [x] 1.2 将 Nexum manifest 和验证器的版本、dist-tag、registry 改为读取专用发布环境变量并保留底层脚本兼容默认值；运行 focused test 验证参数能贯穿构建、打包和验证
- [x] 1.3 新增 `release:nexum:prepare` 编排脚本和根 `package.json` 命令，校验参数并按固定顺序执行 check、文档检查、构建、打包和产物验证；运行 focused test 与手工准备命令验证成功和失败边界

## 2. AI 操作契约

- [x] 2.1 在仓库根目录新增 `nexum-package-release-checklist.md`，写明输入占位符、标准命令、阶段证据、停止条件、禁止 `npm publish` 和人工交接命令；核对清单命令与实际脚本一致
- [x] 2.2 更新 OpenSpec/设计文档中的实现状态与验证要求；运行 `openspec validate nexum-package-release-preparation --strict` 确认规格、设计、任务和清单无占位符

## 3. 集成验证与交付

- [x] 3.1 运行文档检查、focused/full test、统一准备命令、根 `bun run check` 和 `git diff --check`；记录 tarball 路径、版本、tag 及各项通过证据
- [x] 3.2 按项目审查规范完成 diff review、项目卫生检查和任务逐项审计；仅提交本变更文件，使用符合规范的 conventional commit
- [x] 3.3 将任务分支合并到 `dev-v0.0.1`，保留集成分支上用户已有文档修改不被覆盖；在合并后再次准备目标产物并确认工作树、分支 ancestry 和最终交接信息

## Workflow follow-up

- 通过审查、验证和合并后，按项目 OpenSpec 流程归档已完成的 change（如仓库流程要求）。
- 将最终 tarball 路径和人工 `npm publish` 命令交给用户；AI 不执行发布。
