# Nexum Runtime Boundary Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development for safely bounded tasks) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed `@nexum/adapters` aggregate with explicit `@nexum/persistence`, `@nexum/integrations`, and `@nexum/application` packages while removing concrete infrastructure fallbacks from Core.

**Architecture:** Core keeps semantic contracts, domain rules, and runtime services but receives required Ports explicitly. Persistence implements state stores, Integrations implement external technology Ports, and Application owns Skill/Tool/Question orchestration plus the default Runtime Composer. The old adapter package is deleted with no compatibility facade.

**Tech Stack:** Bun, TypeScript, workspace packages, JSON file persistence, Bun tests, Turbo, oxlint.

---

## Package and file map

Create:

- `packages/nexum-persistence`: stores and EventHub implementations;
- `packages/nexum-integrations`: model, Host, MCP, filesystem, and local Skill-source adapters;
- `packages/nexum-application`: Skill/Tool/Question services and Runtime Composer.

Delete after migration: `packages/nexum-adapters`.

Core files to modify: `src/index.ts`, `src/message-store.ts`, `src/permission-policy.ts`, `src/permission.ts`, `src/skill-registry.ts`, plus tests that construct services without explicit stores.

Consumers to migrate: `packages/nexum-server`, `packages/nexum-test`, Core tests, Surface smoke fixtures, root/package READMEs, manifests, lockfile, and active architecture docs.

Target dependency graph:

```text
@nexum/persistence ───────> @nexum/core
@nexum/integrations ──────> @nexum/core
@nexum/application ───────> @nexum/core + @nexum/persistence + @nexum/integrations
@nexum/client ─────────────> @nexum/protocol
@nexum/server ─────────────> @nexum/core + @nexum/application + @nexum/protocol
@nexum/surfaces ───────────> @nexum/client
```

## Task 1: Establish the new package boundaries

**Files:**

- Create: `packages/nexum-persistence/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/nexum-integrations/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/nexum-application/package.json`, `tsconfig.json`, `src/index.ts`
- Modify: `packages/nexum-core/test/package-boundary.test.ts`
- Modify: `packages/nexum-test/test/repository-boundary.test.ts`
- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: Write boundary assertions first**

  Add tests that read package manifests and assert:

  ```ts
  expect(core.dependencies ?? {}).not.toHaveProperty("@nexum/persistence")
  expect(core.dependencies ?? {}).not.toHaveProperty("@nexum/integrations")
  expect(application.dependencies).toEqual(expect.objectContaining({
    "@nexum/core": "workspace:*",
    "@nexum/persistence": "workspace:*",
    "@nexum/integrations": "workspace:*",
  }))
  ```

  Also assert that active source/manifests do not import `@nexum/adapters` after migration.

- [ ] **Step 2: Run the boundary tests to capture RED**

  ```bash
  bun test --cwd packages/nexum-core test/package-boundary.test.ts
  bun test --cwd packages/nexum-test test/repository-boundary.test.ts
  ```

  Expected: the new package/deletion assertions fail because the old package is still present.

- [ ] **Step 3: Add the three package manifests**

  Persistence and Integrations depend only on `@nexum/core`. Application depends on Core, Persistence, and Integrations. Reuse the existing Bun test/typecheck scripts and do not add new runtime dependencies.

- [ ] **Step 4: Refresh workspace metadata and verify package discovery**

  ```bash
  bun install --lockfile-only
  bun test --cwd packages/nexum-test test/repository-boundary.test.ts
  ```

- [ ] **Step 5: Commit the boundary scaffold**

  ```bash
  git add package.json bun.lock packages/nexum-persistence packages/nexum-integrations packages/nexum-application packages/nexum-core/test/package-boundary.test.ts packages/nexum-test/test/repository-boundary.test.ts
  git commit -m "♻️ refactor(nexum): 建立运行时分层包边界"
  ```

## Task 2: Build `@nexum/persistence`

**Files:**

- Move from `packages/nexum-adapters/src`: `session-store.ts`, `message-store.ts`, `interaction-store.ts`, `events.ts`, `memory.ts`, `in-memory-memory.ts`, `model-config.ts`, `role-prompt.ts`, `permission-policy.ts`
- Create: `packages/nexum-persistence/src/skill-registration-store.ts` for persisted Skill registration state
- Create: `packages/nexum-persistence/src/index.ts`, focused tests, and README
- Modify persistence-focused tests under `packages/nexum-core/test`

- [ ] **Step 1: Add persistence tests with new imports**

  Move the existing store/event tests to `packages/nexum-persistence/test`, change imports to `@nexum/persistence`, and run them before implementations are moved.

  ```bash
  bun test --cwd packages/nexum-persistence
  ```

  Expected: imports or constructors fail because the new package has no implementations yet.

- [ ] **Step 2: Move Session, Message, Interaction, Event, and Memory implementations**

  Preserve atomic temporary-file plus rename writes, serialized write queues, corrupt-file protection, Session deletion, Interaction orphan recovery, EventHub replay/sequence behavior, and Memory namespace/search/remove behavior. Keep one canonical Core Port/error constructor per contract.

- [ ] **Step 3: Move Model Config, Role Prompt, and Permission Policy stores**

  Keep policy rule types, matching, dangerous-operation classification, and evaluation in Core. Move only Store CRUD/backing maps and JSON persistence here. Do not duplicate policy semantics in the new package.

- [ ] **Step 4: Export only persistence implementations**

  `src/index.ts` exports named file/in-memory store constructors and EventHub. It must not export Skill Registry, Tool Registry, Question Broker, ModelPort, HostPort, or Runtime Composer.

- [ ] **Step 5: Run persistence verification**

  ```bash
  bun test --cwd packages/nexum-persistence
  bun run --cwd packages/nexum-persistence typecheck:tsc
  ```

- [ ] **Step 6: Commit persistence migration**

  ```bash
  git add packages/nexum-persistence packages/nexum-core/test
  git commit -m "♻️ refactor(persistence): 拆出文件与内存存储"
  ```

## Task 3: Remove concrete defaults from Core

**Files:**

- Modify: `packages/nexum-core/src/index.ts`, `message-store.ts`, `permission-policy.ts`, `permission.ts`, `skill-registry.ts`
- Modify: Core tests that call `createNexumSessionService()`, `createNexumPermissionBroker()`, or `createNexumCodingLoop()` without explicit stores
- Create: `packages/nexum-core/test/core-required-ports.test.ts`

- [ ] **Step 1: Add failing required-Port tests**

  Assert that Core does not export or instantiate `createInMemoryMessageStore`, `createInMemoryPermissionPolicyStore`, or file implementations, and that constructors reject missing required stores with stable configuration errors.

- [ ] **Step 2: Run RED**

  ```bash
  bun test --cwd packages/nexum-core test/core-required-ports.test.ts test/package-boundary.test.ts
  ```

- [ ] **Step 3: Remove Core fallbacks**

  Remove the private in-memory SessionStore and MessageStore constructors. Require the SessionStore, MessageStore, and PermissionPolicyStore at the Core construction boundary. Keep permission evaluation, Session semantics, Coding Loop semantics, and stable error codes unchanged.

- [ ] **Step 4: Update Core tests to inject Persistence implementations**

  Replace every `../../nexum-adapters/src/index.ts` import with `@nexum/persistence`. Pass explicit stores to every Core service under test; remove all test-local duplicate store implementations.

- [ ] **Step 5: Run Core verification**

  ```bash
  bun test --cwd packages/nexum-core
  bun run --cwd packages/nexum-core typecheck:tsc
  ```

  Expected: all Core tests pass, including the two baseline `instanceof` failures, with no aggregate adapter import.

- [ ] **Step 6: Commit Core cleanup**

  ```bash
  git add packages/nexum-core
  git commit -m "♻️ refactor(core): 移除基础设施默认实现"
  ```

## Task 4: Build `@nexum/integrations`

**Files:**

- Move: `openai-model.ts`, `local-host.ts`, `directory.ts`, `mcp.ts`
- Split: project-context portion of `context.ts` into `src/project-context.ts`
- Split: local Skill filesystem scanning into `src/local-skill-source.ts`
- Create: `packages/nexum-integrations/src/index.ts`, tests, and README

- [ ] **Step 1: Add integration contract tests**

  Cover OpenAI-compatible SSE/non-streaming responses and redaction, Host workspace boundaries and cancellation, MCP list/call mapping, unreadable project-context files, and Skill source path/symlink/size validation.

- [ ] **Step 2: Move external technology adapters**

  Move Model, Host, directory, and MCP implementations unchanged at the Port boundary. Integrations may import Core but must not import Persistence or Application.

- [ ] **Step 3: Extract the local Skill source**

  Expose discovery, validation, and relative-file reading only. Keep absolute paths private. Do not place registration CRUD, duplicate-ID policy, or Skill orchestration in this adapter.

- [ ] **Step 4: Export only external integrations and verify**

  ```bash
  bun test --cwd packages/nexum-integrations
  bun run --cwd packages/nexum-integrations typecheck:tsc
  ```

- [ ] **Step 5: Commit integrations**

  ```bash
  git add packages/nexum-integrations
  git commit -m "♻️ refactor(integrations): 拆出外部能力适配器"
  ```

## Task 5: Build `@nexum/application`

**Files:**

- Move: `local-tools.ts`, `configured-loop.ts`, Question portion of `context.ts`, and Runtime composition from `index.ts`
- Split/rewrite: orchestration portion of `skill-registry.ts`
- Create: `packages/nexum-application/src/runtime.ts`, `question.ts`, `tools.ts`, `skills.ts`, `index.ts`, tests, and README

- [ ] **Step 1: Add application service tests**

  Cover Tool Registry definitions/execution, Question pending/reply/cancel, Skill register/refresh/list/get/unregister, configured Coding Loop model selection, and Runtime override precedence.

- [ ] **Step 2: Implement Skill Registry orchestration**

  Coordinate an injected Skill Source and registration Store. Own registration lifecycle, candidate grouping, conflict status, refresh selection, and safe summaries. Do not call `node:fs` directly.

- [ ] **Step 3: Move Tool Registry and Question Broker**

  Tool Registry depends on Core Session/Host/Skill Ports. Question Broker owns process-local pending/resolved state and optionally writes UI-visible records through the Core InteractionStore Port.

- [ ] **Step 4: Implement the Runtime Composer**

  `createEmbeddedRuntime` injects in-memory Persistence and local Integrations. `createLocalRuntime` injects JSON-file Persistence and local Integrations under the current `.nexum` filenames. Explicit overrides win before defaults are created.

- [ ] **Step 5: Run Application verification**

  ```bash
  bun test --cwd packages/nexum-application
  bun run --cwd packages/nexum-application typecheck:tsc
  ```

- [ ] **Step 6: Commit Application**

  ```bash
  git add packages/nexum-application
  git commit -m "♻️ refactor(application): 拆出运行时应用服务"
  ```

## Task 6: Migrate consumers and delete the aggregate package

**Files:**

- Modify manifests/imports in `packages/nexum-server`, `packages/nexum-test`, `packages/nexum-core`, and Surface smoke fixtures
- Modify Server `src/index.ts`, `src/main.ts`, `src/events.ts`, and affected tests
- Modify Test Workbench `src/dev.ts`, tests, and fixtures
- Delete: `packages/nexum-adapters/**`
- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: Update dependencies and imports by responsibility**

  Runtime composers import from `@nexum/application`; stores/EventHub import from `@nexum/persistence`; Model/Host/MCP/filesystem adapters import from `@nexum/integrations`; Skill/Tool/Question services import from `@nexum/application`.

- [ ] **Step 2: Update Server and Test runtime wiring**

  Server startup and Test Workbench obtain local Runtime from Application. No Server handler constructs a store, model, Host, or Skill source.

- [ ] **Step 3: Delete the old package and regenerate the lockfile**

  ```bash
  rm -rf packages/nexum-adapters
  bun install --lockfile-only
  rg -n '@nexum/adapters|nexum-adapters' packages package.json bun.lock
  ```

  Expected: the search returns no active source, manifest, or lockfile references.

- [ ] **Step 4: Run focused cross-package tests**

  ```bash
  bun test --cwd packages/nexum-core
  bun test --cwd packages/nexum-persistence
  bun test --cwd packages/nexum-integrations
  bun test --cwd packages/nexum-application
  bun test --cwd packages/nexum-server
  bun test --cwd packages/nexum-test
  ```

- [ ] **Step 5: Commit consumer migration**

  ```bash
  git add packages package.json bun.lock
  git commit -m "♻️ refactor(nexum): 完成运行时包迁移"
  ```

## Task 7: Update documentation and enforce the new boundary

**Files:**

- Modify: `README.md`, `packages/README.md`, `CONTRIBUTING.md`
- Modify new package READMEs
- Modify active OpenSpec/design/plan documents that describe the old aggregate package
- Modify: `packages/nexum-test/test/repository-boundary.test.ts`

- [ ] **Step 1: Update terminology and diagrams**

  Describe Persistence as storage implementations, Integrations as external technology adapters, Application as services/composition, and Surfaces as Protocol/Client consumers. Explicitly state that Permission Policy, Skill Registry, Tool Registry, and Question Broker are not infrastructure adapters.

- [ ] **Step 2: Add forbidden-reference checks**

  Reject `@nexum/adapters`, `packages/nexum-adapters`, and old direct source paths in active source, manifests, lockfile, and documentation. Archived historical records may retain names only when explicitly historical.

- [ ] **Step 3: Run all verification**

  ```bash
  git diff --check
  bun run check
  bun run --cwd packages/nexum-core typecheck:tsc
  bun run --cwd packages/nexum-persistence typecheck:tsc
  bun run --cwd packages/nexum-integrations typecheck:tsc
  bun run --cwd packages/nexum-application typecheck:tsc
  bun run --cwd packages/nexum-server typecheck:tsc
  bun run --cwd packages/nexum-test typecheck:tsc
  bun run --cwd packages/nexum-surfaces typecheck:tsc
  bun run --cwd packages/nexum-surfaces test:smoke:isolated
  ```

- [ ] **Step 4: Commit documentation and enforcement**

  ```bash
  git add README.md packages/README.md CONTRIBUTING.md packages openspec docs
  git commit -m "📝 docs(nexum): 更新运行时分层与适配器边界"
  ```

## Final audit

- [ ] `packages/nexum-adapters` and `@nexum/adapters` are absent from active repository state.
- [ ] Core no longer constructs concrete default stores.
- [ ] New package dependencies match the target graph.
- [ ] Persistence, Integrations, Application, Server, Test, Core, and Surface checks pass.
- [ ] Final worktree is clean and every task commit is present before integration.
