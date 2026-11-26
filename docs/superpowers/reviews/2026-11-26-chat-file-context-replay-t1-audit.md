# 任务审计：修复文件上下文与消息回显

## 范围

- 任务：OpenSpec `chat-file-context-replay` 1.1。
- 影响范围：ChatSurface 的 Prompt 组成、历史消息回显、Session 状态合并和文件上下文 UI。
- 未修改 Protocol、Server HttpApi 或文件存储边界。

## 实现审查

- 文件 Prompt 现在包含“浏览器已读取正文”的明确说明、文件名、正文开始/结束标记，并要求模型不要按文件名调用 `read`、`ls` 或其他工作目录工具。
- 用户 ChatItem 会从当前格式和上一版本格式提取原始问题与文件名；正文仍保留在发送给模型及历史保存的完整 Prompt 中。
- 用户气泡只显示问题和附件摘要，避免长文件正文遮挡用户问题。
- `applyState` 通过 ID 合并待处理权限/问题，不再替换已有聊天项；历史消息和乐观用户消息不会因初始化回写被删除。
- 历史加载期间禁用发送和文件选择，避免初始化竞态造成丢消息。

## 验证证据

- RED：旧实现无法满足新 Prompt 边界和历史回显断言。
- GREEN：`packages/nexum-chat-surface` 测试 15 通过；类型检查通过。
- UI：定向上传 Markdown smoke 1 通过，验证请求正文、用户问题和附件摘要。
- 构建：`packages/nexum-surfaces` 类型检查和 Vite 构建通过。
- 全仓：`bun run check` 通过，14/14 类型检查任务成功。
- 格式：`git diff --check` 通过。

## 结论

任务实现与设计和 OpenSpec 场景一致，没有发现阻塞性问题，可以标记完成并提交。
