# Tasks

## 1. ChatSurface 文件上下文

### 任务边界与执行计划

- 模块代理：`chat-surface-file-context`（主代理直接执行）。
- 负责范围：`packages/nexum-chat-surface/src/chat-surface.tsx`、`packages/nexum-chat-surface/src/styles.css`、`packages/nexum-chat-surface/test/`、`packages/nexum-chat-surface/README.md`，以及本变更的 OpenSpec/设计文档。
- 不在范围：Protocol、Client、Server、数据库、文件上传接口、多文件/拖拽上传和二进制解析。
- 依赖：复用现有 `ChatProtocolAdapter.sendMessage`、Solid 状态和 ChatSurface 的 busy/错误反馈；不新增运行时依赖。
- 聚焦验证：`bun test test/chat-file-context.test.ts`、`bun run typecheck:tsc`（在 `packages/nexum-chat-surface`）。
- broader 验证：`bun run build`（在 `packages/nexum-surfaces`）、`VITE_NEXUM_API_URL=http://127.0.0.1:4098 NEXUM_SMOKE_API_HOST=127.0.0.1 NEXUM_SMOKE_API_PORT=4098 NEXUM_SMOKE_UI_PORT=5174 bun test test/permission.smoke.spec.ts --test-name-pattern 'reads a local Markdown file'`（在 `packages/nexum-surfaces`）、`bun run check`（仓库根目录）。
- 直接执行回退理由：本任务同时修改 ChatSurface 的共享 JSX、状态与样式，拆分代理会产生重叠写入和合并风险；范围足够小，主代理可以保持 TDD、审查和验证闭环。

- [x] 1.1 为文件选择、文本读取、扩展名/大小校验、Prompt 包装和失败恢复编写测试并实现 ChatSurface 文件上下文；验证 ChatSurface focused test、包级 typecheck、`packages/nexum-surfaces` build、真实浏览器文件选择 smoke 和仓库 `bun run check` 全部通过，且可选择 `.md/.txt`、移除附件、读取失败保留输入并在发送成功后清理附件。

## Workflow follow-up

- 完成实现后执行 OpenSpec 验证、计划一致性审计、code-review-spec 和前端交互审计。
- 任务审计通过后标记 1.1、按仓库 commit 规范提交，并合并回 `dev-v0.0.1`。
- 全部验证通过后归档 `chat-file-context` OpenSpec 变更。
