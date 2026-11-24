# Nexum Documentation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立从根 `README.md` 可导航的 Nexum 文档体系，覆盖 UI 交互协议、能力语义、完整 Runtime API 和全部 `nexum-*` 模块。

**Architecture:** 根 README 作为总入口；`docs/ui/` 和 `docs/capabilities/` 描述跨层协作契约；`docs/modules/` 描述 package 实现边界；`apis/nexum.md` 按单一业务模块维护完整 HTTP/SSE 契约。所有内容以当前源码、测试和已有规范为事实来源，不改变运行时行为。

**Tech Stack:** Markdown、现有 TypeScript/Bun 源码和测试、OpenSpec、Prettier。

---

## Task 1: 文档入口与架构基线

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `apis/README.md`
- Modify: `packages/README.md`
- Create: `docs/architecture/module-boundaries.md`
- Create: `docs/architecture/runtime-flow.md`

- [ ] **Step 1: Build the documentation inventory**

  Read the current root README, directory READMEs, package manifests, package source entrypoints, and `apis/nexum.md`. Record the ten current package names and the existing API route groups before editing navigation.

  Run:

  ```bash
  find packages -mindepth 1 -maxdepth 1 -type d -name 'nexum-*' | sort
  rg -n 'url\.pathname|pathname\.match\(' packages/nexum-server/src/index.ts
  ```

  Expected: the package list and route list are available as the source inventory for the navigation and architecture pages.

- [ ] **Step 2: Add root README navigation and directory back-links**

  Add a concise “文档导航” section to `README.md` linking to every architecture, UI, capability, API, and module document created by this plan. Update directory READMEs so each links back to `../README.md` or the correct root-relative path. Correct the existing package link that points to `nexum-persistence/package.json` and add the missing `nexum-chat-surface` entry.

  Keep the root README focused on overview and navigation; do not copy full endpoint contracts or Protocol types into it.

- [ ] **Step 3: Write architecture boundary documentation**

  Create `docs/architecture/module-boundaries.md` with the dependency graph, package responsibility table, allowed dependency direction, public entrypoints, and “does not own” boundaries. Create `docs/architecture/runtime-flow.md` with the Prompt → Application → Core → Protocol/Server → Surface flow, event emission, interaction pauses, cancellation, terminal states, and recovery entry points.

  Link each package name to its module document and each runtime behavior to the relevant capability/API document, even when the target document is created in a later task.

- [ ] **Step 4: Verify Task 1**

  Run:

  ```bash
  git diff --check
  bunx prettier --check 'README.md' 'docs/**/*.md' 'apis/**/*.md' 'packages/README.md'
  ```

  Expected: no whitespace errors and all Markdown files pass Prettier. Every newly referenced target path must exist or be created in the same task before commit; no broken local links remain.

- [ ] **Step 5: Commit Task 1**

  ```bash
  git add README.md docs/README.md apis/README.md packages/README.md docs/architecture
  git commit -m "$(cat <<'EOF'
  📝 docs: 建立文档入口与架构说明

  将根 README 设为文档总入口，并补充 Nexum 模块边界与 Runtime 流程说明。

  Refs: OpenSpec nexum-documentation-system task 1.2-1.3
  EOF
  )"
  ```

## Task 2: UI 交互与核心能力文档

**Files:**

- Create: `docs/ui/interaction-protocol.md`
- Create: `docs/ui/states.md`
- Create: `docs/ui/question.md`
- Create: `docs/ui/permission.md`
- Create: `docs/capabilities/session.md`
- Create: `docs/capabilities/events.md`
- Create: `docs/capabilities/skills.md`
- Create: `docs/capabilities/integrations.md`
- Create: `docs/capabilities/model-runtime.md`
- Create: `docs/capabilities/context-and-history.md`

- [ ] **Step 1: Document the common UI interaction vocabulary**

  Use `packages/nexum-protocol/src/index.ts`, `packages/nexum-application/src/context.ts`, `packages/nexum-surfaces/src/main.tsx`, and `packages/nexum-surfaces/src/confirm-dialog.tsx` to define the distinction between Runtime-driven and local UI interactions in `docs/ui/interaction-protocol.md`.

  Include the discovery path, pending/submitting/result/cancelled/orphaned states, user-visible rendering rules, ownership of validation, and the rule that UI must not infer interaction types from text.

- [ ] **Step 2: Document common states and local operation reliability**

  Write `docs/ui/states.md` with loading, empty, error, disabled, submitting, success, cancellation, session-switch, reconnect, and service-restart behavior. Include the ConfirmDialog behavior that blocks duplicate submission and close actions while busy, and link to the source component.

- [ ] **Step 3: Document Question and Permission**

  Write `docs/ui/question.md` and `docs/ui/permission.md` from the actual Protocol types, Server routes, Application broker, Persistence interaction store, and Surface rendering. Include structured fields, single/multiple selection, reply/cancel paths, session ownership, validation failures, pending recovery, orphaned records, permission policy modes, and caller handling.

- [ ] **Step 4: Document Session and Events**

  Write `docs/capabilities/session.md` and `docs/capabilities/events.md` from Protocol, Server, Client, Application and persistence behavior. Cover session creation/list/update/delete, canonical history, prompt/continue/cancel, SSE event envelope, sequence/order, deduplication, terminal settlement, reconnect and history recovery.

- [ ] **Step 5: Document remaining current capabilities**

  Write `skills.md`, `integrations.md`, `model-runtime.md`, and `context-and-history.md` using current package READMEs, source exports, tests, and existing OpenSpec specs. Mark behavior as `现状基线` or `实验性` where the implementation requires it; do not introduce future behavior as if implemented.

- [ ] **Step 6: Verify Task 2**

  Run:

  ```bash
  rg -n 'question\.|permission\.|session\.|run\.settled|assistant\.|tool\.' docs/ui docs/capabilities
  git diff --check
  bunx prettier --check 'docs/ui/**/*.md' 'docs/capabilities/**/*.md'
  ```

  Expected: every documented event/field is traceable to Protocol or a referenced implementation/test, and all Markdown passes formatting.

- [ ] **Step 7: Commit Task 2**

  ```bash
  git add docs/ui docs/capabilities
  git commit -m "$(cat <<'EOF'
  📝 docs: 补充 UI 交互与能力协议

  记录 Question、Permission、Session、事件流和运行状态的前后端协作契约。

  Refs: OpenSpec nexum-documentation-system task 2.1-2.4
  EOF
  )"
  ```

## Task 3: Complete the Runtime API contract

**Files:**

- Modify: `apis/nexum.md`
- Modify: `apis/README.md` if the navigation or coverage description changes

- [ ] **Step 1: Create the route coverage matrix**

  Re-read `packages/nexum-server/src/index.ts`, Protocol types, Client methods, Application services, Server tests, and the existing API document. Build a coverage table mapping every externally exposed route to one section in `apis/nexum.md`.

  Include health, capabilities, model, role prompt, session, experimental messages/continue, prompt, cancel, events, permission policy, permission reply, question list/reply/cancel, and skills routes exactly as implemented.

- [ ] **Step 2: Complete runtime/config/session endpoint chapters**

  Add or correct chapters for health, capabilities, model/probe, role prompt, session list/create/update/delete/state, messages, prompt, continue, cancel, and events. Each chapter must state Method/URL, path/query params, request body, request headers/cookies, auth status, success response, error response, caller handling, and a matching curl example. Explicitly write “不适用” for absent parameter categories.

- [ ] **Step 3: Complete interaction and skill endpoint chapters**

  Add or correct chapters for permission policy/list/reply, question list/reply/cancel, and skill list/detail/register/refresh/validate/delete/activate. Keep error codes and HTTP statuses aligned with Server implementation and tests; link the UI/capability documents rather than duplicating their state explanations.

- [ ] **Step 4: Document SSE and cross-cutting conventions**

  Ensure the API document explains JSON Envelope, `meta.protocolVersion`, `traceId`, SSE event envelope, sequence semantics, reconnect behavior, experimental route rules, error redaction, caching/Cookie applicability, and current authentication behavior as verified rather than assumed.

- [ ] **Step 5: Verify Task 3**

  Run:

  ```bash
  rg -n 'route|端点|覆盖|curl|请求头|响应头|Cookie|错误' apis/nexum.md
  rg -n 'url\.pathname|pathname\.match\(' packages/nexum-server/src/index.ts
  git diff --check
  bunx prettier --check 'apis/**/*.md'
  ```

  Expected: every Server route has exactly one API chapter, each chapter has request/response/error/example content, and no undocumented route remains.

- [ ] **Step 6: Commit Task 3**

  ```bash
  git add apis/nexum.md apis/README.md
  git commit -m "$(cat <<'EOF'
  📝 docs: 完善 Nexum Runtime API 文档

  按服务端实际路由补齐请求、响应、错误、SSE 和联调示例契约。

  Refs: OpenSpec nexum-documentation-system task 3.1-3.4
  EOF
  )"
  ```

## Task 4: Package module documentation

**Files:**

- Create: `docs/modules/nexum-protocol.md`
- Create: `docs/modules/nexum-client.md`
- Create: `docs/modules/nexum-server.md`
- Create: `docs/modules/nexum-chat-surface.md`
- Create: `docs/modules/nexum-surfaces.md`
- Create: `docs/modules/nexum-core.md`
- Create: `docs/modules/nexum-application.md`
- Create: `docs/modules/nexum-persistence.md`
- Create: `docs/modules/nexum-integrations.md`
- Create: `docs/modules/nexum-test.md`

- [ ] **Step 1: Document Protocol, Client, Server and UI packages**

  Create the five protocol/surface module documents from each package README, `package.json`, source exports, tests, and the API/capability documents. Each must include responsibilities, non-responsibilities, public entrypoints, dependency direction, capabilities, lifecycle, errors, verification commands, and change synchronization links.

- [ ] **Step 2: Document Core, Application and adapter packages**

  Create the five runtime/adapter module documents from source exports and tests. Explicitly separate Core domain semantics, Application orchestration, Persistence stores, Integrations external services, and Test-only composition. Include the current file persistence/recovery and port injection boundaries.

- [ ] **Step 3: Add module mapping and synchronization checklists**

  For each module document, link its package README and source entrypoint, list the capabilities it implements or consumes, and specify which API/UI/capability docs must be updated after a public change. Ensure `nexum-chat-surface` is documented separately from `nexum-surfaces`.

- [ ] **Step 4: Verify Task 4**

  Run:

  ```bash
  find packages -mindepth 1 -maxdepth 1 -type d -name 'nexum-*' | sort
  find docs/modules -maxdepth 1 -type f -name 'nexum-*.md' | sort
  git diff --check
  bunx prettier --check 'docs/modules/**/*.md'
  ```

  Expected: package and module-document inventories match one-to-one, all module documents contain the required sections, and Markdown formatting passes.

- [ ] **Step 5: Commit Task 4**

  ```bash
  git add docs/modules
  git commit -m "$(cat <<'EOF'
  📝 docs: 添加 Nexum 模块边界文档

  为全部 nexum package 记录职责、依赖、入口、能力映射和维护同步规则。

  Refs: OpenSpec nexum-documentation-system task 4.1-4.3
  EOF
  )"
  ```

## Task 5: Cross-link and final verification

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `apis/README.md`
- Modify: `packages/README.md`
- Modify: any document with a broken or incomplete cross-link
- Modify: `openspec/changes/nexum-documentation-system/tasks.md`

- [ ] **Step 1: Normalize links and metadata**

  Add status, authoritative source, and last-checked metadata to the new capability and module documents. Normalize relative links so users can reach every document from root README and every module page links back to its capability/API context.

- [ ] **Step 2: Run the full documentation audit**

  Run:

  ```bash
  openspec validate nexum-documentation-system --type change --strict
  git diff --check
  bunx prettier --check 'README.md' 'docs/**/*.md' 'apis/**/*.md' 'packages/README.md'
  ```

  Also run a repository-local link check using the final changed Markdown paths, and compare the root README navigation against the package and document inventories. Expected: OpenSpec valid, no whitespace errors, all Markdown formatted, every required local target present, every package represented, every Server route represented.

- [ ] **Step 3: Mark OpenSpec tasks and commit the integration audit**

  Update `openspec/changes/nexum-documentation-system/tasks.md` so completed implementation tasks use `[x]` only after their own verification passed. Commit only the task marker and any final link/metadata fixes with a Chinese Conventional Commit body and OpenSpec footer.

## Workflow follow-up

- After all tasks pass the per-task audit, merge each task branch into `dev-v0.0.1` and verify ancestry.
- Run the final repository-level documentation audit on the integration branch.
- Archive `nexum-documentation-system` only after all tracked tasks are complete and the change validates as archived.
