# Session History Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Nexum 页面从持久化 canonical 消息恢复完整对话，并通过向上分页滚动查看历史，同时保持 SSE 事件实时更新。

**Architecture:** Server 从 `MessageStore` 读取消息并以分页安全投影返回；Protocol/Client 定义消息历史和 sequence 游标契约；Surfaces 首次加载消息历史、向上分页，再订阅游标之后的 SSE。对话消息和事件日志保持两条独立展示路径。

**Tech Stack:** Bun、TypeScript、Nexum Protocol/Client/Server、SolidJS、Playwright Smoke、OpenSpec。

---

### Task 1: 定义消息历史协议并覆盖 Server 契约

**Files:**
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-server/test/server.test.ts`
- Test: `packages/nexum-protocol/test/protocol.test.ts`

- [ ] **Step 1: Write the failing tests**

添加 GET 消息历史测试：准备带 user、assistant toolCalls、tool 和 `context:summary` 的 MessageStore，断言最新页、`before` 游标、`hasMore`、未知 Session、非法 limit/before 和凭据脱敏行为。

- [ ] **Step 2: Run tests to verify failure**

Run: `cd packages/nexum-server && bun test test/server.test.ts`

Expected: 新增接口请求返回 `404` 或响应契约缺失。

- [ ] **Step 3: Implement minimal protocol and route**

在 Protocol 增加安全的 `NexumMessage` 联合类型和分页响应；在 Server route 中校验 Session、解析有界分页参数，从 `MessageStore.load` 截取最新或更早窗口，映射 `index`，并递归调用现有脱敏函数后返回标准 envelope。

- [ ] **Step 4: Run focused tests**

Run: `cd packages/nexum-server && bun test test/server.test.ts`

Expected: 消息历史接口新增测试与既有 Server 测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/nexum-protocol/src/index.ts packages/nexum-protocol/test/protocol.test.ts packages/nexum-server/src/index.ts packages/nexum-server/test/server.test.ts
git commit -m "✨ feat(protocol): 暴露 Session 消息历史查询"
```

### Task 2: 接入 Client 分页查询和事件 sequence 游标

**Files:**
- Modify: `packages/nexum-client/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-server/test/events.test.ts`

- [ ] **Step 1: Write the failing event cursor test**

发布 sequence 1、2、3 的事件，使用 `afterSequence: 2` 订阅，断言只收到 sequence 3；先运行确认当前 Client/Server 不支持该参数。

- [ ] **Step 2: Implement Client and Server cursor support**

在事件选项增加可选 `afterSequence`，Client 通过 query 参数传递；Server 优先解析合法 sequence，传给 Event Hub 的 `afterSequence`，保留 `Last-Event-ID` 的既有恢复逻辑。

- [ ] **Step 3: Add typed message history method**

在 `NexumClient.experimental.nexum.session` 增加分页 messages 方法，封装 `before` 和 `limit` query，并导出 Protocol 消息历史类型。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd packages/nexum-server && bun test test/events.test.ts test/server.test.ts`

Run: `cd packages/nexum-client && bun typecheck`

Expected: 事件游标和分页 Client 类型均 PASS。

### Task 3: 页面恢复消息历史并支持向上滚动

**Files:**
- Modify: `packages/nexum-surfaces/src/main.tsx`
- Modify: `packages/nexum-surfaces/src/styles.css`
- Test: `packages/nexum-surfaces/test/permission.smoke.spec.ts`

- [ ] **Step 1: Write the failing UI tests**

拦截消息历史接口和事件流：刷新已有 Session 后断言历史 user/assistant 出现；滚动到顶部触发带 `before` 的第二次请求且旧内容仍存在；历史接口失败时显示重试状态；事件流从 `lastSequence` 后开始且不重复历史消息。

- [ ] **Step 2: Implement history state and loader**

增加消息历史分页状态、加载锁、错误状态和 Session 选择序列；选择 Session 时请求最新页，过期响应直接丢弃；将 canonical 消息映射为现有 ChatItem，保留工具和压缩摘要可读内容。

- [ ] **Step 3: Implement scroll anchoring and live merge**

在 `conversation-body` 顶部阈值触发上一页请求；插入顶部后以 `scrollHeight` 差值恢复 `scrollTop`；事件连接携带 `lastSequence`，实时事件继续走现有投影，完成事件后刷新最新页以收敛最终文本。

- [ ] **Step 4: Add interaction states and styles**

显示顶部“正在加载更早消息”、失败重试按钮和无更多历史状态；加载期间保留已显示 DOM，不清空对话；为状态提供 `aria-live` 文案和 reduced-motion 兼容样式。

- [ ] **Step 5: Run UI verification**

Run: `cd packages/nexum-surfaces && bun test test/permission.smoke.spec.ts --timeout 15000`

Run: `cd packages/nexum-surfaces && bun run typecheck:tsc && bun run build`

Expected: 历史恢复、分页滚动、失败恢复和实时合并测试 PASS。

### Task 4: API 文档和集成审计

**Files:**
- Modify: `apis/nexum-session.md` (若仓库已有对应模块文档则更新该文件)
- Modify: `openspec/changes/context-history-replay/tasks.md`

- [ ] **Step 1: Document the public route**

记录 URL、query、分页响应、消息类型、错误码、脱敏边界和 curl 示例，确保与 Protocol 和 Server 实现一致。

- [ ] **Step 2: Run broad verification**

Run: `openspec validate context-history-replay --type change --strict`

Run: `bun run check`

Run: `cd packages/nexum-core && bun test test/context-compaction.test.ts test/message-store.test.ts`

Expected: OpenSpec 严格校验、全量检查和持久化/压缩回归测试均 PASS。

- [ ] **Step 3: Verify in the browser**

启动本地前后端，选择已有 Session，刷新页面并向上滚动；确认历史消息和压缩摘要可见、新 Prompt 只追加一次、事件页仍能显示事件窗口。

- [ ] **Step 4: Commit and integrate**

完成代码审查、计划一致性审计、任务审计后，提交中文 Conventional Commit，合并回 `dev-v0.0.1`，验证祖先关系并归档 OpenSpec change。
