# Tasks

## 1. 根边界

- [x] 1.1 新增仓库边界测试，验证根包名、workspace glob、发现的 workspace 包名和活动配置只使用 Nexum；运行 `cd packages/nexum-test && bun test test/repository-boundary.test.ts`，先确认它因旧配置失败。
- [x] 1.2 更新根 `package.json`、`turbo.json`、`bunfig.toml`、`.oxlintrc.json` 和 `.gitignore`，使默认入口、workspace、依赖和 lint/typecheck 只服务 Nexum；重新运行边界测试确认通过。
- [x] 1.3 更新活动 README、贡献指南、安全说明和目录说明，验证文档中的当前命令和路径指向 `packages/nexum-*`，并运行 `git diff --check`。

## 2. 旧资产清理

- [x] 2.1 在边界测试中加入旧 OpenCode 包目录不存在和 Nexum 源码不导入 `@opencode/*` 的断言；运行测试确认删除前失败。
- [x] 2.2 删除设计中列出的 OpenCode 产品包、数据/插件/进程工具、根脚本、补丁、安装器、Nix 文件和旧 Changelog；保留 Nexum 包、API、历史文档和 OpenSpec。
- [x] 2.3 运行 `bun install` 更新 `bun.lock`，再运行边界测试确认 workspace 只解析七个 `@nexum/*` 包，并提交删除与 lockfile 变更。

## 3. 交付验证

- [x] 3.1 在每个 Nexum 包目录运行既有测试与类型检查；对 `packages/nexum-surfaces` 额外运行 typecheck 和 build。
- [x] 3.2 运行根 `bun run check`、`git diff --check`、`openspec validate pure-nexum-repository --strict` 和活动配置的 `git grep` 检查，记录完整输出。
- [ ] 3.3 重启本地 Test Workbench，通过浏览器配置模型、创建/恢复 Session、注册用户指定 Skill 地址并用 `@metric-view-lifecycle` 激活，确认模型、Session、Skill 和角色提示词持久化不回归。

## Workflow follow-up

- 完成代码审查、验证和集成分支合并后，归档 `pure-nexum-repository` OpenSpec 变更并验证归档结果。
