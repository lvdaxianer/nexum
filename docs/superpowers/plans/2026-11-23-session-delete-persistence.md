# Session 删除与持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Nexum 增加安全、可重试的 Session 删除能力，清理 Nexum 自有历史数据但保留用户工作目录和全局模型配置。

**Architecture:** Core 定义按 Session 删除端口，Adapter 为内存/JSON Store 提供原子清理实现；Server 编排消息、交互、事件、Session 元数据的依赖优先删除并映射稳定错误。手写 Nexum Client 暴露 DELETE 调用，Solid Surface 复用现有 ConfirmDialog 完成确认、pending、失败恢复和当前项切换。

**Tech Stack:** Bun、TypeScript、Nexum Core/Adapters/Server/Client、Solid、Kobalte AlertDialog、Playwright、OpenSpec。

---

## 文件责任映射

- Core contracts：`packages/nexum-core/src/index.ts`、`packages/nexum-core/src/message-store.ts`、`packages/nexum-core/src/interaction-store.ts`
- Persistent adapters：`packages/nexum-adapters/src/session-store.ts`、`message-store.ts`、`interaction-store.ts`、`events.ts`、对应测试
- HTTP boundary：`packages/nexum-server/src/index.ts`、`packages/nexum-server/test/server.test.ts`
- Hand-written protocol client：`packages/nexum-protocol/src/index.ts`、`packages/nexum-client/src/index.ts`、`packages/nexum-client/test/client.test.ts`
- UI：`packages/nexum-surfaces/src/main.tsx`、`packages/nexum-surfaces/src/styles.css`、`packages/nexum-surfaces/test/permission.smoke.spec.ts`
- Public API docs：`apis/nexum.md`
- Durable planning：`openspec/changes/session-delete-persistence/`、本计划与设计文档

## Task 1: Core 与 Store 删除端口

**Boundary / agent dispatch:** `storage-deletion-agent` owns Core contracts and Adapter Store implementations/tests only. Allowed files: the Core/Adapter files in the mapping above and their tests. Out of scope: HTTP routes, Client, UI, API docs. Dependency: none. Focused verification: `bun test test/session.test.ts test/session-store.test.ts test/message-store.test.ts test/interaction-store.test.ts` from `packages/nexum-core` plus the affected adapter tests. Broader verification: `bun test` from `packages/nexum-server` for EventHub compatibility. Handoff evidence: diff, RED/GREEN outputs, and exact test counts.

- [x] 1.1 **RED — Session deletion contract:** add a Core session test that creates two Sessions, deletes one settled Session, asserts it is absent while the other remains, and asserts deleting a running Session rejects with `session_busy`. Run `bun test test/session.test.ts --test-name-pattern 'delete'` in `packages/nexum-core`; expected failure because `delete` is not yet part of the service/store contract.
- [x] 1.2 **GREEN — Session Store:** add `delete(sessionID)` to `SessionStore`, implement it in in-memory and file stores with serialized atomic persistence, and add file restart coverage. Re-run the focused session tests until green.
- [x] 1.3 **RED/GREEN — Message, interaction, and event history:** add one focused test per Store proving target-only deletion, no-op deletion of a missing target, and fresh-instance absence; implement the smallest matching methods while preserving temp-file + rename serialization and existing sensitive-data handling. Run the affected Core/Adapter tests and `bun test` in `packages/nexum-server`.
- [x] 1.4 **Refactor/review:** inspect the Task 1 diff against `nexum-session-deletion` requirements and the backend reliability checklist, then run `git diff --check` and all focused tests again.

## Task 2: Server、Client 与 API 文档

**Boundary / agent dispatch:** `session-delete-api-agent` owns the Nexum Server route, protocol/client method, server/client tests, and `apis/nexum.md`. Allowed files: the Server/Client/Protocol/API-doc files in the mapping. Out of scope: Core/Adapter implementations and UI. Dependencies: Task 1 methods. Focused verification: `bun test test/server.test.ts test/protocol-v1.test.ts` from `packages/nexum-server` and `bun test` from `packages/nexum-client`. Broader verification: `bun run --cwd packages/nexum-server typecheck:tsc` and `bun run --cwd packages/nexum-client typecheck:tsc`.

- [x] 2.1 **RED — HTTP deletion contract:** add Server tests for settled deletion success, `404 NEXUM_SESSION_NOT_FOUND`, `409 NEXUM_SESSION_RUN_CONFLICT`, repeated delete, related history removal, and working-directory preservation. Run the focused test with `bun test test/server.test.ts --test-name-pattern 'delete'`; expected failure because the DELETE route is absent.
- [x] 2.2 **GREEN — Server orchestration:** add `DELETE /api/nexum/session/:sessionID`, validate the resource through `NexumSessionService`, reject `running`, call dependent Store cleanup before Session metadata deletion, and map storage failures to `NEXUM_SESSION_DELETE_FAILED` without exposing internals. Re-run Server tests and inspect request audit logs for the route.
- [x] 2.3 **RED/GREEN — Client contract:** add `NexumSessionDeleteResult` to protocol types and `client.experimental.nexum.session.delete({ sessionID })`; test method, encoded path, JSON envelope, and stable error parsing in `packages/nexum-client/test/client.test.ts`.
- [x] 2.4 **API documentation:** add a complete `DELETE /api/nexum/session/:sessionID` section to `apis/nexum.md` covering path params, headers, body/cookie non-applicability, success/error response fields, retry semantics, and a runnable curl example. Verify every field matches the Server test response.
- [x] 2.5 **Review/re-verify:** apply REST API documentation and backend reliability checks to the route, run focused tests, both package typechecks, `git diff --check`, and confirm no generated `packages/client` files were touched because this is the Nexum hand-written client.

## Task 3: Web Surface 删除交互

**Boundary / agent dispatch:** `surface-delete-agent` owns the UI deletion flow and browser smoke coverage only. Allowed files: `packages/nexum-surfaces/src/main.tsx`, relevant styles, and `permission.smoke.spec.ts`. Out of scope: Server, Core, Client, and API docs. Dependencies: Task 2 Client method. Focused verification: the new serial Playwright smoke test. Broader verification: `bun run --cwd packages/nexum-surfaces typecheck:tsc`, `bun run --cwd packages/nexum-surfaces build`, and the full smoke file.

- [x] 3.1 **RED — confirmation behavior:** add a browser test that opens Session actions, clicks delete, asserts the confirmation dialog is visible and no DELETE request occurred, then cancels and asserts the Session remains. Run the single test against the built UI; expected failure because the delete control is absent.
- [x] 3.2 **GREEN — delete interaction:** add a red destructive control in the existing Session actions drawer, reuse `ConfirmDialog`, disable repeated confirmation while pending, preserve the current state on failure, and after successful response abort SSE, remove the stable ID from the list, clear `sessionStorage`, and select the next Session or empty state. Keep work-directory text unchanged in the test fixture.
- [x] 3.3 **Success/failure coverage:** extend the smoke test for successful current Session deletion, list transition, no second DELETE on repeated activation, server 409 feedback for a running Session, and retention of the directory on disk. Run the focused smoke test and inspect the rendered UI states.
- [x] 3.4 **Review/re-verify:** apply frontend interaction checks for explicit confirmation, destructive styling, pending/disabled/error/success/empty states, focus-safe dialog close behavior, and stable ID list updates; run typecheck, build, full smoke, and `git diff --check`.

## Task 4: Integration and completion audit

- [x] 4.1 Run `bun test` from `packages/nexum-server`, focused Core/Adapter tests from Task 1, `bun test` from `packages/nexum-client`, Surface typecheck/build/smoke, `openspec validate session-delete-persistence --strict`, and `git diff --check`; separately record the pre-existing full Core-suite class-instance failures if they remain isolated from focused tests. 聚焦包测试、Surface 构建/类型检查、删除相关 smoke、OpenSpec 严格校验和 diff 检查均通过；隔离 UI 全量 smoke 的既有模型 Probe/浏览器上下文用例存在环境级偶发失败；根目录 `bun run check` 受既有缺失 `bun check` 脚本阻断。
- [x] 4.2 Re-read `proposal.md`, `spec.md`, `design.md`, and this plan; verify model configuration persistence, Session persistence, deletion boundary, API documentation, and UI confirmation one by one with file/test evidence. Run the final code-review and per-task audit before marking all OpenSpec tasks complete.
- [x] 4.3 Archive the completed OpenSpec change only after all implementation tasks and audits pass, then merge the clean task branch back into `dev-v0.0.1` with `--no-ff` and verify ancestry.
