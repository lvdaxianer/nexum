# Tasks

## 1. README 使用者路径

- [x] 1.1 重排 `README.md` 的开头，说明 Nexum 的定位、解决的问题、适用场景和当前能力，并核对内容与 Core/Protocol 文档一致
- [x] 1.2 补齐 Test Workbench、Server/CLI 和三种 Runtime 组合示例，使用当前 root scripts、`createEmbeddedRuntime`、`createLocalRuntime`、`createSqliteRuntime` 和 `startNexumServer`，并验证示例中的导出真实存在

## 2. 模块与组合说明

- [x] 2.1 将架构说明改为 Core、Persistence、Integrations、Application、Protocol/Transport、Surface、Test 边界，补齐三个 Persistence 实现包并核对 package manifest 依赖方向
- [x] 2.2 增加 Runtime Port 注入和替换说明，明确 memory/file/sqlite 的选择，更新模块地图、文档导航和项目状态，并验证所有当前一级 `packages/nexum-*` 包均可从 README 找到

## 3. 文档交付验证

- [x] 3.1 运行 README 本地链接检查、`git diff --check` 和相关 Markdown Prettier 检查，确保示例、文档链接和格式有效
- [x] 3.2 运行根目录 `bun run check`，完成 README 与批准设计的逐项审计，并记录不涉及运行时、Protocol、生成文件和依赖的结果

## Workflow follow-up

- 任务通过逐任务审查、验证和提交后，归档 `readme-guide` OpenSpec change。
- 任务分支合并回 `dev-v0.0.1` 后，确认 integration branch 包含 README change。
