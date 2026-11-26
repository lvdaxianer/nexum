# ChatSurface 本地文本文件上下文实施计划

**Goal:** 让 ChatSurface 选择一个 `.md` 或 `.txt` 文件并在发送时把全文附加到 Prompt，同时保留失败恢复能力。

**Architecture:** 文件只在浏览器端通过 `File.text()` 读取。组件状态保存文件名和文本，纯函数负责扩展名、大小和最终 Prompt 组装；现有 `ChatProtocolAdapter.sendMessage` 和 Server 接口保持不变。

**Tech Stack:** SolidJS、TypeScript、Bun test、现有 ChatSurface CSS/Protocol adapter。

## Task 1: 添加文本文件上下文能力

**Files:**

- Modify: `packages/nexum-chat-surface/src/chat-surface.tsx`
- Modify: `packages/nexum-chat-surface/src/styles.css`
- Test: `packages/nexum-chat-surface/test/chat-file-context.test.ts`
- Modify: `packages/nexum-chat-surface/README.md`

- [ ] **Step 1: Write the failing test**

  覆盖纯函数行为：`.md/.txt` 扩展名通过、其他扩展名和大于 512 KiB 的文件拒绝；最终 Prompt 保留问题、文件名、全文和结束分隔符。

- [ ] **Step 2: Run the focused test and verify RED**

  Run `bun test packages/nexum-chat-surface/test/chat-file-context.test.ts` from the task worktree. Expected result: the new exported helper is missing or assertions fail because file-context behavior does not exist yet。

- [ ] **Step 3: Write the minimal GREEN implementation**

  在 `ChatSurface` 内加入隐藏文件选择器、`accept` 白名单、单附件状态和读取 busy 状态；使用 `File.text()` 读取，失败时保留 Prompt 和附件状态；发送时通过纯函数拼接文件上下文，并仅在 adapter 成功后清空 Prompt/附件。为文件名、大小限制和文件上下文分隔符定义常量，补充中文状态反馈和可见键盘操作路径。

- [ ] **Step 4: Run focused and package verification**

  Run `bun test packages/nexum-chat-surface/test/chat-file-context.test.ts`, `bun run typecheck:tsc` in `packages/nexum-chat-surface`, and `bun run build` in `packages/nexum-surfaces`. Expected result: all tests pass, no TypeScript errors, and the UI bundle builds successfully。

- [ ] **Step 5: Update component documentation**

  在 `packages/nexum-chat-surface/README.md` 记录文件类型、大小限制、浏览器本地读取和 Prompt 附加行为，确保文档与实现一致。

- [ ] **Step 6: Run broader verification**

  Run `bun run check` from the repository root. Expected result: repository lint/type checks pass without修改 Protocol、Client、Server 依赖方向。
