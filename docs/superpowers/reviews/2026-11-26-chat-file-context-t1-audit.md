# ChatSurface 文件上下文 T1 审查记录

## 范围

- 任务：OpenSpec `chat-file-context` task 1.1。
- 集成分支：`dev-v0.0.1`。
- 任务分支：`features/✅CHG-001-T1--上传文本文件`。
- 变更范围：ChatSurface 本地 `.md/.txt` 读取、Prompt 上下文拼接、composer 状态、组件文档和 UI smoke。

## 计划一致性

- 采用已批准的浏览器本地读取方案，未新增 Protocol、Client、Server 或文件上传接口。
- 单文件上限为 512 KiB，按扩展名白名单校验，发送成功后才清理输入和附件。
- 失败时保留问题文本；读取失败清理失效的原生选择值并保留可重试错误提示。
- 组件和 Web Component 继续复用同一 ChatSurface 实现。

## 需求覆盖

| 需求 | 证据 |
| --- | --- |
| 支持 `.md` / `.txt` | `validateChatFile`、原生 `accept`、UI smoke 选择 `notes.md` |
| 类型和大小错误可恢复 | 校验单测；错误状态使用 `role="alert"`，输入不被清空 |
| 发送时附加完整上下文 | `composeChatPrompt` 单测；UI smoke 断言真实 POST body |
| 移除附件 | composer 的“移除”按钮调用 `clearFileContext` |
| 发送成功才清理 | `sendPrompt` 在 adapter 成功后清理；失败分支不清理 |
| 防重复和状态反馈 | 读取/发送 busy 状态同时禁用选择、移除和发送 |
| 无路径泄露/无新 API | diff 仅涉及 Surface、文档和测试；Protocol/Client/Server 未修改 |

## 交互审查

- 选择、读取、发送均有局部状态反馈；文件读取中禁止重复选择和发送。
- 发送失败保留 Prompt 与已读取附件；类型、大小和读取错误提供修正路径。
- 文件选择器有明确 `accept`、中文 `aria-label`；可见按钮承担键盘操作，隐藏 input 从 Tab 顺序移除。
- 文件名使用截断样式，窄屏不会撑开输入栏；移除操作使用危险语义色但不执行破坏性服务端操作。
- 未发现需要 REST API 文档的外部路由变更。

## 验证证据

- `bun test test/chat-file-context.test.ts`：3 pass。
- `bun test`（`packages/nexum-chat-surface`）：14 pass。
- `bun run typecheck:tsc`（`packages/nexum-chat-surface`）：通过。
- `bun run typecheck:tsc`（`packages/nexum-surfaces`）：通过。
- `bun run build`（`packages/nexum-surfaces`）：通过。
- 隔离端口真实浏览器 smoke：1 pass，验证文件选择、POST body 和成功清理附件。
- `bun run check`：oxlint 通过，15 个包中 14 个 typecheck 任务成功。
- `openspec validate chat-file-context --strict`：通过。
- `git diff --check`：通过。

## code-review-spec 结果

- 按 canonical `code-review-spec`、方法注释、空值安全、参数数量、魔法值、重复逻辑和异常处理规则检查本次 diff。
- 新增方法均使用中文多行 JSDoc，常量承载文件上限、扩展名和 Prompt 标记；未新增日志、HTTP 路由、数据库或远程调用。
- 无必须修复项；未发现超出已批准范围的实现漂移。

## 结论

任务 1.1 的实现、测试、文档、前端交互检查和 broader 验证均已满足，允许标记 OpenSpec task 完成并进入提交门禁。
