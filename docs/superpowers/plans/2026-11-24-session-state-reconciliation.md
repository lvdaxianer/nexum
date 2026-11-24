# Session State Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Nexum 聊天界面在运行终态到达后统一收敛时间线卡片，并实时同步宿主 Session 列表。

**Architecture:** ChatSurface 继续消费有序事件并负责 run 内部投影；终态事件通过可选回调通知宿主。宿主只按稳定 Session ID 更新对应列表项，避免全量刷新和额外轮询。

**Tech Stack:** SolidJS、TypeScript、Bun test、Playwright smoke tests、OpenSpec。

---

### Task 1: Add terminal projection regression tests

**Files:**
- Modify: `packages/nexum-chat-surface/test/chat-projection.test.ts`

- [ ] **Step 1: Write the failing test**

  构造 `model.attempt`、`assistant.text`、`run.settled` 事件序列，断言同一 run 的模型项和 Agent 项都不再是 `running/streaming`；对 `failed` 和 `cancelled` 各增加一条独立断言。

- [ ] **Step 2: Run the focused test**

  Run: `cd packages/nexum-chat-surface && bun test test/chat-projection.test.ts`

  Expected: 新增断言失败，原因是当前终态投影只新增结果卡片，没有收敛旧卡片。

### Task 2: Implement ChatSurface reconciliation and callback

**Files:**
- Modify: `packages/nexum-chat-surface/src/chat-surface.tsx`
- Modify: `packages/nexum-chat-surface/src/index.ts`

- [ ] **Step 1: Add the smallest terminal reconciliation helper**

  在 `projectChatEvent` 的 `run.settled` 分支中，先根据 `runID` 和结果更新 transient thinking、assistant、reasoning、model attempt 与 retry 项，再追加/更新唯一的 settled 状态项；不要覆盖已完成的工具、权限和问题项。

- [ ] **Step 2: Add the optional host callback**

  在 `ChatSurfaceProps` 增加可选 `onSessionStatusChange(sessionID, status)`，仅在已识别的终态事件中调用；回调不是必填项，未提供时现有宿主行为保持不变。

- [ ] **Step 3: Run focused tests**

  Run: `cd packages/nexum-chat-surface && bun test test/chat-projection.test.ts`

  Expected: 原有投影测试和新增三种终态测试全部通过。

### Task 3: Sync the host Session list incrementally

**Files:**
- Modify: `packages/nexum-surfaces/src/main.tsx`
- Test: `packages/nexum-surfaces/test/permission.smoke.spec.ts`

- [ ] **Step 1: Add the failing host-level assertion**

  在现有 ChatSurface 宿主测试中验证终态事件到达后，匹配 Session 的状态更新为终态，其他 Session 保持原状态。

- [ ] **Step 2: Merge by stable Session ID**

  将回调传给 ChatSurface，并用 `setSessions(current => current.map(...))` 只替换匹配项的状态字段；不重新请求整个列表。

- [ ] **Step 3: Run host checks**

  Run: `cd packages/nexum-surfaces && bun typecheck`

  Expected: 宿主类型检查通过，既有 smoke 测试不回归。

### Task 4: Verify, audit, commit, and merge

**Files:**
- Modify: `openspec/changes/session-state-reconciliation/tasks.md`

- [ ] **Step 1: Validate artifacts**

  Run: `openspec validate session-state-reconciliation --strict`

- [ ] **Step 2: Run package and repository verification**

  Run: `cd packages/nexum-chat-surface && bun test`

  Run: `cd packages/nexum-surfaces && bun test`

  Run: `bun run check`

- [ ] **Step 3: Review the diff**

  Confirm only the intended state projection, callback, host merge, tests and change artifacts are modified; confirm no generated client files or unrelated branches are touched.

- [ ] **Step 4: Commit and merge**

  Mark all completed OpenSpec tasks, create a Chinese Conventional Commit with body and `Refs: OpenSpec session-state-reconciliation`, then merge `fix-runtime-state` into `dev-v0.0.1` with `--no-ff`.
