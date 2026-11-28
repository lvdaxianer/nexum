# Tasks

## 1. 公共边界与内部 Demo

- [x] 1.1 将完整工作台源码、Vite 入口和相关测试迁移到 `packages/nexum-test`，并让其通过 `@nexum/chat-surface` 引入右侧聊天区；验证 `bun run --cwd packages/nexum-test typecheck:tsc` 与本地构建通过。
- [x] 1.2 从发布 manifest、构建脚本、验证器和公共文档中移除 `surfaces` 入口；验证 tarball 不包含 `surfaces.js` 或 `surfaces.css`。

## 2. ChatSurface 主题契约

- [x] 2.1 先添加 `theme="light"`/`theme="dark"` 类型和组件样式隔离的失败测试，再实现主题类型收敛与根节点覆盖；验证暗色宿主中强制浅色、浅色宿主中强制深色的行为。
- [x] 2.2 更新 ChatSurface README、模块文档和迁移说明；验证文档审计不再把工作台作为公共 UI。

## 3. 低版本发布编译

- [x] 3.1 先添加发布产物静态扫描失败测试，再调整公共构建只输出 ChatSurface 的低版本浏览器 ESM；验证产物无 `import.meta`、顶层 `await`、workspace specifier 和未降级现代语法。
- [x] 3.2 增加外部 browser consumer 的 import、类型和 CSS 验证；验证只安装 tarball 即可导入 `nexum-ai/chat-surface`。

## 4. 集成验证

- [x] 4.1 执行 OpenSpec 严格校验、代码检查、类型检查、包构建、tarball 验证和文档审计；修复所有阻断项并记录结果。
- [x] 4.2 完成代码审查、每项任务审计、提交并合并到 `dev-v0.0.1`；验证集成分支包含任务提交且工作树干净。

## Workflow follow-up

- 通过 OpenSpec 验证后归档 `publish-chat-surface-only`。
