# Tasks

## 1. 发布入口与失败验证

- [x] 1.1 建立单一 `nexum` release entrypoint/subpath 映射，列出根入口、Core、Application、Protocol、Persistence 变体、Integrations、Client、Server、Surface Adapter、Chat Surface 和 CLI，并验证每个 source entrypoint 存在
- [x] 1.2 先编写仓库外 artifact/manifest 审计脚本，要求检查单一包名、禁止 `@nexum/*` 发布依赖、必须存在 JS/`.d.ts`/exports；在未生成产物时运行并确认以预期缺失错误失败

## 2. Release artifact 构建

- [x] 2.1 实现 release builder，生成 `artifacts/nexum/package.json`、`README.md`、`LICENSE` 和 `dist`，将内部 workspace 编译进各 subpath，并将第三方运行时依赖写入生成 manifest；验证 `bun run build:packages` 生成完整目录
- [x] 2.2 生成并重写 `.d.ts`，把内部 `@nexum/*` 类型引用转换成 `nexum/<subpath>`，并验证产物声明中没有 `@nexum/`、`src/` 或未解析相对路径
- [x] 2.3 处理 Chat Surface CSS、CLI bin、Persistence 变体和根 facade，验证 `exports` 中每个入口都能解析到 dist 文件
- [x] 2.4 更新 `.gitignore`/构建脚本/包元数据边界，确保 `dist`、artifact 和临时 consumer 不进入提交；运行 project-hygiene 检查并确认无秘密或源码产物泄漏

## 3. Tarball 与仓库外 Consumer

- [x] 3.1 实现 `pack:nexum` 和 `verify:nexum`，在仓库外临时目录生成 tarball、安装唯一 `nexum` 包并执行 ESM import、TypeScript typecheck、CLI bin 和 CSS 检查
- [x] 3.2 验证 tarball 不含 `src`、`test`、`.turbo`、workspace lockfile、内部 package manifest 或其他本地路径，并让错误路径以非零状态失败

## 4. 模块使用文档

- [x] 4.1 为每个 `packages/nexum-*` README 统一补充公共 `nexum` 安装方式、subpath、最小示例、组合关系、运行约束和 workspace 开发命令
- [x] 4.2 新增或补齐 `docs/modules/` 中 Persistence memory/file/sqlite 等模块文档，更新模块索引，使每个源码模块都有唯一可到达的使用/边界文档
- [x] 4.3 更新根 README 的安装、组合和文档导航，区分用户安装 `nexum` 与贡献者运行 workspace；验证文档示例不再要求用户安装 `@nexum/*`
- [x] 4.4 实现文档与 release manifest 的 subpath 覆盖审计，验证每个公共入口有文档、每个文档入口存在于 manifest

## 5. 集成验证与交付

- [x] 5.1 运行 `bun run build:packages`、`bun run pack:nexum`、`bun run verify:nexum`、相关包测试、类型检查和根 `bun run check`，记录所有命令结果
- [x] 5.2 完成 plan-implementation、code-review-spec、project-hygiene 和 per-task audit，确认本变更没有修改 Runtime/Protocol 行为，再提交并合并到 `dev-v0.0.1`

## Workflow follow-up

- 归档 `package-publishing` OpenSpec change，并在归档前验证所有任务已完成。
- 任务分支合并后按分支命名清理规则处理 worktree；若分支不满足清理 allowlist，保留并报告具体原因。
