# Plan / Build Agent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, Core-enforced Plan/Build Agent mode to Nexum, with safe plan-file writes, public API support, and a reliable UI switcher.

**Architecture:** Store `plan | build` on each Session, expose it through Protocol/Server/Client, and enforce Plan restrictions inside the Coding Loop before PermissionPort and ToolPort. The Surface renders the mode independently from permission approval settings and updates only the affected Session row after a successful mode change.

**Tech Stack:** Bun, TypeScript, SolidJS, Hono-style Web Request handlers, JSON/File/SQLite persistence, Bun test, Playwright smoke tests.

---

## Task 1: Core session mode and persistence contract

**Files:**
- Modify: `packages/nexum-core/src/index.ts`
- Modify: `packages/nexum-persistence/src/session-store.ts`
- Modify: `packages/nexum-persistence-sqlite/src/store.ts`
- Test: `packages/nexum-core/test/session.test.ts`
- Test: `packages/nexum-persistence/test/session-store.test.ts`
- Test: `packages/nexum-persistence-file/test/file-persistence.test.ts`
- Test: `packages/nexum-persistence-sqlite/test/sqlite-persistence.test.ts`

- [ ] **Step 1: Write failing Core session tests** for default `build`, `setMode`, repeated mode updates, and rejecting mode changes while `running`.
- [ ] **Step 2: Run `bun test test/session.test.ts` from `packages/nexum-core` and verify the new assertions fail because the mode field and service method do not exist.**
- [ ] **Step 3: Add `NexumAgentMode`, `mode` to `SessionRecord`, optional mode input, `setMode`, and the queued state transition implementation with `session_busy` protection.**
- [ ] **Step 4: Run the focused Core session tests and verify they pass.**
- [ ] **Step 5: Write failing persistence tests** for missing mode migration and round-tripping `plan` through in-memory/file/SQLite stores.
- [ ] **Step 6: Run the focused persistence tests and verify the new assertions fail before migration code changes.**
- [ ] **Step 7: Update all persistence adapters to default missing/invalid mode to `build` and preserve explicit modes.**
- [ ] **Step 8: Run the Core, persistence, and SQLite focused tests and verify they pass.**
- [ ] **Step 9: Commit the task with `feat(core): add persistent plan and build session modes`.**

## Task 2: Core Plan-mode tool enforcement

**Files:**
- Modify: `packages/nexum-core/src/index.ts`
- Modify: `packages/nexum-core/src/tools.ts`
- Test: `packages/nexum-core/test/coding-loop.test.ts`
- Test: `packages/nexum-core/test/tools.test.ts`

- [ ] **Step 1: Write failing tests** showing Plan mode permits read and `.nexum/plans/<sessionID>.md` writes, rejects business writes, Shell, MCP, and Skill management, and Build mode preserves existing tool calls.
- [ ] **Step 2: Run the focused Core tests and verify they fail because tool filtering and the `plan_mode_restricted` boundary do not exist.**
- [ ] **Step 3: Add mode-aware tool selection and Plan-mode system context with the deterministic plan path.**
- [ ] **Step 4: Add a second enforcement check immediately after model tool-call normalization and before PermissionPort evaluation; return a safe failed ToolResult/event without calling ToolPort.**
- [ ] **Step 5: Add path normalization that allows only relative `.nexum/plans/` paths and rejects traversal/absolute paths.**
- [ ] **Step 6: Run focused Core tests and verify Plan and Build behavior.**
- [ ] **Step 7: Run the existing Core coding-loop and tools suites to catch regressions.**
- [ ] **Step 8: Commit with `feat(core): enforce plan mode tool boundaries`.**

## Task 3: Protocol, Server, and Client API

**Files:**
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `apis/nexum.md`
- Modify: `docs/zh-CN/capabilities/session.md`
- Test: `packages/nexum-server/test/server.test.ts`
- Test: `packages/nexum-server/test/protocol-v1.test.ts`
- Test: `packages/nexum-client/test/client.test.ts`

- [ ] **Step 1: Write failing protocol/client/server tests** for mode in Session responses, optional mode validation, update success, 404, and running-session 409 behavior.
- [ ] **Step 2: Run focused Server and Client tests and verify the new assertions fail.**
- [ ] **Step 3: Add protocol mode types and include mode in Session and Session State projections.**
- [ ] **Step 4: Extend the existing Session PUT route and Client method to validate and forward optional mode without breaking name-only updates.**
- [ ] **Step 5: Map Core errors to the existing stable HTTP error envelope and preserve response trace IDs.**
- [ ] **Step 6: Run focused Server and Client tests and verify all API cases pass.**
- [ ] **Step 7: Update the Nexum API and Chinese Session capability docs with request/response/error/curl examples for mode updates.**
- [ ] **Step 8: Run the affected package typechecks and API documentation verification.**
- [ ] **Step 9: Commit with `feat(protocol): expose plan and build session modes`.**

## Task 4: Surface mode switcher and interaction states

**Files:**
- Modify: `packages/nexum-surfaces/src/main.tsx`
- Modify: `packages/nexum-surfaces/src/styles.css`
- Modify: `packages/nexum-surfaces/test/permission.smoke.spec.ts`
- Modify: `packages/nexum-surfaces/test/session-state.test.ts`

- [ ] **Step 1: Write failing UI tests** for the visible mode badge, switching from Plan to Build, pending disabled state, failure recovery, and disabled switching during a running Session.
- [ ] **Step 2: Run the focused Surface smoke test and verify the new assertions fail.**
- [ ] **Step 3: Add a mode signal derived from the selected Session and a mode switch control next to the composer permission control.**
- [ ] **Step 4: Implement the async mode update lifecycle: disable repeated clicks, update only the matching Session by ID on success, preserve the previous mode on failure, and announce status.**
- [ ] **Step 5: Add responsive styles, visible focus state, semantic `aria-pressed`/label text, and mode-specific helper copy.**
- [ ] **Step 6: Run the Surface focused tests at narrow and wide viewport sizes and verify all interaction states.**
- [ ] **Step 7: Run the Surface typecheck and build.**
- [ ] **Step 8: Commit with `feat(surface): add plan and build mode switcher`.**

## Task 5: Integrated verification and handoff

**Files:**
- Modify: `packages/nexum-core/README.md`
- Modify: `docs/README.md`
- Modify: `docs/zh-CN/modules/nexum-client.md`
- Test: affected package suites

- [ ] **Step 1: Update package/module documentation** to explain Plan restrictions, the plan file path, mode persistence, and Build handoff.
- [ ] **Step 2: Run focused tests from package directories:** `bun test` in `packages/nexum-core`, `packages/nexum-persistence`, `packages/nexum-persistence-sqlite`, `packages/nexum-server`, and `packages/nexum-client`; run the Surface smoke suite separately.
- [ ] **Step 3: Run `bun run check` from the repository root.**
- [ ] **Step 4: Run `git diff --check`, inspect the final diff against the integration branch, and verify no user-owned pre-existing files were changed.**
- [ ] **Step 5: Complete the plan-implementation audit and code-review/domain gates.**
- [ ] **Step 6: Commit documentation/verification changes with `docs: document plan and build agent modes`.**
