# Tasks

## 1. 可嵌入 Surface 组件边界

- [x] 1.1 在 `packages/nexum-surfaces` 增加公共入口行为测试，先验证导入入口、无 DOM 根节点副作用、API 基地址配置和本地启动入口；运行对应 focused test 并确认当前实现以预期原因 RED
- [x] 1.2 将工作台实现拆成无副作用的 `NexumSurfaces` 组件、公共 `src/index.ts` 和本地 `src/entry.tsx` 启动入口；支持宿主传入 API 基地址；运行 `bun run --cwd packages/nexum-surfaces typecheck:tsc` 和 focused test 验证 GREEN
- [x] 1.3 保持 Vite 本地页面行为与完整样式加载；运行 `bun run --cwd packages/nexum-surfaces build` 并确认 `dist/index.html` 和浏览器资源构建成功

## 2. 发布产物与仓库外消费

- [x] 2.1 先扩展发布验证的失败断言，要求 `surfaces` JavaScript、声明、CSS、manifest export 和 consumer import 均存在；运行 `bun run verify:nexum` 记录缺失入口的 RED 证据
- [x] 2.2 在发布构建中注册 `./surfaces`、生成 `surfaces.js`/`surfaces.d.ts`/`surfaces.css`，并将除 `nexum-test` 外的 workspace 模块纳入公共入口映射；运行 `bun run build:packages` 验证产物生成
- [x] 2.3 完成仓库外 consumer 的 `surfaces` 运行时导入、类型检查和 CSS 安装验证；运行 `bun run pack:nexum` 与 `bun run verify:nexum` 验证 tarball 不含源码、测试或 workspace 引用

## 3. 文档与交付审计

- [x] 3.1 更新中英文模块索引、Surfaces 模块文档和根级公共模块说明，提供 `nexum-ai/surfaces` 组件/CSS import 示例；运行 `bun run verify:docs` 验证入口与文档一致
- [x] 3.2 运行 `bun run check`、`git diff --check`、OpenSpec 严格校验和任务级审计，确认实现、规格、文档与发布验证一致

## Workflow follow-up

- 完成每个任务的 focused/broader verification、code-review-spec、frontend-interaction-guidelines 和 per-task audit 后，逐项标记任务并按 commit skill 创建原子提交。
- 将任务分支以 `--no-ff` 合并回记录的 `dev-v0.0.1`，验证 ancestry 后清理 worktree，并恢复用户原有 stash。
- 所有任务完成后执行最终审计并归档 `publish-surfaces-component` OpenSpec change。

## Task boundary and dispatch plan

- 模块型执行者：Surface 公共边界与发布产物维护者。
- 责任范围：`packages/nexum-surfaces/src/**`、`packages/nexum-surfaces/test/**`、`script/nexum-package.ts`、`script/build-nexum.ts`、`script/verify-nexum.ts`、相关模块文档和本 OpenSpec change。
- 不在范围：Core、Protocol、Server 业务逻辑；用户已有未提交 UI 修改；npm publish 或 registry 写操作。
- 依赖：现有 `@nexum/client`、`@nexum/chat-surface`、Solid/Vite 构建链和统一发布脚本。
- focused verification：`bun test`（`packages/nexum-surfaces`）、`bun run --cwd packages/nexum-surfaces typecheck:tsc`、`bun run --cwd packages/nexum-surfaces build`。
- broader verification：`bun run build:packages`、`bun run pack:nexum`、`bun run verify:nexum`、`bun run verify:docs`、`bun run check`、`git diff --check`。
- handoff evidence：公共入口 import、类型检查、CSS 存在性、仓库外 consumer、tarball 清单和文档审计输出。
- 执行策略：由主 agent 直接执行；组件入口、CSS 聚合、manifest、consumer 验证和文档必须保持同一变更契约，拆分给多个实现者会产生重叠写入和难以独立验收的中间状态，因此不适合并行委派。
