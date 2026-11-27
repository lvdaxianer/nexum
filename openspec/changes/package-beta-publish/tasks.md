# Tasks

## 1. 公开 beta 包身份与发布验证

- [x] 1.1 将 release builder、公开入口映射和生成 manifest 统一改为 `nexum-ai@0.1.0-beta.0`，保留内部 `@nexum/*` workspace，并为产物声明 Bun 运行时；验证生成 manifest、exports 和声明入口符合 `package-beta-release` 与 `package-publishing` specs
- [x] 1.2 将根 README、模块 README、模块索引和仓库外 consumer 验证同步为 `nexum-ai` 安装/import 入口；验证 `bun run verify:docs`、tarball 清单和所有公开 subpath 不再泄漏旧包名或 workspace 引用
- [ ] 1.3 从专用 worktree 执行 `bun run build:packages`、`bun run pack:nexum`、`bun run verify:nexum`、`bun run check` 及相关包测试；通过 per-task audit 后提交变更，并使用 `npm publish artifacts/nexum --tag beta` 发布 `nexum-ai@0.1.0-beta.0`，再用 `npm view nexum-ai version dist-tags` 验证 registry 状态

## Task boundary and agent dispatch

- 模块代理名：`release-package-identity`（主代理直接执行）。
- 责任：维护公开包名/版本映射、公开文档、tarball consumer 验证和 beta 发布证据。
- 允许文件：`script/` 发布脚本、根 README 与 `README.zh-CN.md`、`packages/nexum-*/README.md`、`docs/modules/` 与本 OpenSpec change；允许生成被 `.gitignore` 忽略的 `artifacts/nexum`。
- 不在范围：Runtime、Protocol、Server 业务实现、HTTP API、workspace 依赖图、Node.js 兼容改造和独立包拆分。
- 依赖：现有单包构建器、已归档 `package-publishing` spec、Bun 运行时和 npm registry 凭据。
- focused verification：`bun run verify:docs`、`bun run build:packages`、`bun run pack:nexum`、`bun run verify:nexum`。
- broader verification：`bun run check`、受影响 package 的 `bun test`/`bun run typecheck:tsc`、OpenSpec strict validation、npm registry 查询。
- 直接执行回退原因：任务修改多个共享发布文件并包含一次外部 npm 发布，委托会增加跨文件合并和发布产物不一致风险；不启动实现子代理。
- 交接证据：完整 diff、OpenSpec task marker、所有 focused/broader 命令退出码、tarball 清单和 `npm view nexum-ai version dist-tags` 输出。

## Workflow follow-up

- 发布完成后将任务分支合并回 `dev-v0.0.1`，通过 worktree closure gate 并验证集成分支包含变更。
- 完成 final audit 后归档 `package-beta-publish` OpenSpec change。
