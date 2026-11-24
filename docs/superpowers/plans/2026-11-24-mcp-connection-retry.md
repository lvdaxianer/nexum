# MCP Connection Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MCP connection initialization and recovery server-owned, bounded, observable, and safe for the Client page to display.

**Architecture:** Extend the existing Core `McpRegistry` state machine instead of adding a second retry worker. The Registry owns retry timers, generation checks, and cancellation; Local Runtime restores persisted configs and injects the Registry; Server/Client expose and observe safe retry snapshots without moving MCP transport into the browser.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, Nexum Core/Application/Protocol/Server/Client, Bun tests, OpenSpec.

---

### Task 1: Core bounded retry state machine

**Files:**
- Modify: `packages/nexum-core/src/mcp.ts`
- Modify: `packages/nexum-core/src/index.ts`
- Test: `packages/nexum-core/test/mcp.test.ts`

- [ ] **Step 1: Write failing tests for initial failure recovery and observable retry state**

Add connector fixtures that fail once and then return a connection. Assert that `registry.connect()` returns or publishes `retrying`, that the connector is called again after the bounded delay, and that the final snapshot is `connected` with no retry metadata. Add a fixture that always fails and assert the final snapshot is `failed` after exactly three scheduled retries.

- [ ] **Step 2: Run the focused Core test to verify it fails**

Run:

```bash
cd packages/nexum-core
bun test test/mcp.test.ts
```

Expected: the new tests fail because `McpServerStatus` has no `retrying` state and initial `connect()` does not schedule a retry.

- [ ] **Step 3: Add retry snapshot fields and centralize retry scheduling**

Extend `McpServerStatus` with `retrying`; add optional `retryAttempt` and `nextRetryAt` to `McpServer`. Replace the current close-only scheduler with a helper that accepts the failed generation and failure kind, uses delays `[250, 1000, 3000]`, publishes `retrying`, and schedules `registry.connect()` only for recoverable failures. Keep `needs_auth`, `invalid_config`, `runtime_closed`, disabled entries, and explicit stops out of the scheduler.

The connection failure path must return the current safe snapshot immediately while the scheduled retry runs in the background. When the retry budget is exhausted, publish `failed` with the last safe error and clear retry metadata. A successful connection resets the attempt counter.

- [ ] **Step 4: Run the focused Core tests and typecheck**

Run:

```bash
cd packages/nexum-core
bun test test/mcp.test.ts
bun typecheck
```

Expected: all existing MCP lifecycle tests and the new retry tests pass.

- [ ] **Step 5: Commit the Core task**

```bash
git add packages/nexum-core/src/mcp.ts packages/nexum-core/src/index.ts packages/nexum-core/test/mcp.test.ts
git commit -m "feat(core): ✨ 增加 MCP 初始连接重试"
```

### Task 2: Runtime startup recovery and shutdown ownership

**Files:**
- Modify: `packages/nexum-application/src/index.ts`
- Modify: `packages/nexum-persistence/src/mcp-store.ts`
- Modify: `packages/nexum-core/src/runtime.ts`
- Test: `packages/nexum-application/test/runtime.test.ts`
- Test: `packages/nexum-core/test/runtime.test.ts`

- [ ] **Step 1: Write failing startup recovery tests**

Create a file-backed MCP config store containing one enabled and one disabled config. Build the local runtime with a fake connector and assert that startup restores both entries, starts one asynchronous connection, leaves the disabled entry disabled, and does not create connector calls when no configs exist. Add a close test that proves pending retry timers and connector operations are cancelled and repeated `runtime.close()` is safe.

- [ ] **Step 2: Run focused Runtime tests to verify they fail**

Run:

```bash
cd packages/nexum-application
bun test test/runtime.test.ts
cd ../nexum-core
bun test test/runtime.test.ts
```

Expected: local runtime does not currently create or restore an MCP Registry.

- [ ] **Step 3: Add an explicit local MCP assembly path**

Add a small Application-level factory or option path that composes `McpServerConfigStore`, `McpCredentialStore`, `createMcpSdkConnector`, `createMcpOAuthManager`, and `createMcpRegistry`. Restore configs before returning the runtime, but start enabled connections asynchronously; do not block Server readiness on remote network calls. Inject the resulting Registry and OAuth control into `createEmbeddedRuntime` so the existing tool registry and `runtime.close()` own them.

Keep the no-MCP path unchanged: if no config store/configuration is provided, do not create a connector, callback listener, or network request. On close, stop OAuth attempts before MCP transports and make the operation idempotent.

- [ ] **Step 4: Run Runtime tests, affected typechecks, and regression tests**

Run:

```bash
cd packages/nexum-core
bun test test/runtime.test.ts
bun typecheck
cd ../nexum-application
bun test test/runtime.test.ts
bun typecheck
```

Expected: startup recovery, no-MCP startup, timer cancellation, and repeated close all pass.

- [ ] **Step 5: Commit the Runtime task**

```bash
git add packages/nexum-application/src/index.ts packages/nexum-persistence/src/mcp-store.ts packages/nexum-core/src/runtime.ts packages/nexum-application/test/runtime.test.ts packages/nexum-core/test/runtime.test.ts
git commit -m "feat(runtime): ✨ 恢复并管理 MCP 启动连接"
```

### Task 3: Protocol, Server, and Client retry status

**Files:**
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Modify: `packages/nexum-surfaces/src/main.tsx`
- Test: `packages/nexum-server/test/mcp-api.test.ts`
- Test: `packages/nexum-client/test/mcp.test.ts`

- [ ] **Step 1: Write failing API and Client tests**

Use a fake MCP port that publishes `retrying` snapshots and assert that the Server list response includes `retryAttempt` and `nextRetryAt` without headers or tokens. Add Client request assertions for the existing list call and an explicit `connect` retry action. Add a surface-level state helper test or component test for mapping `pending`, `retrying`, `connected`, `needs_auth`, and `failed` to user-facing labels.

- [ ] **Step 2: Run focused API and Client tests to verify they fail**

Run:

```bash
cd packages/nexum-server
bun test test/mcp-api.test.ts
cd ../nexum-client
bun test test/mcp.test.ts
```

Expected: the new retry fields and Client startup state are absent.

- [ ] **Step 3: Update protocol DTOs and server responses**

Extend `NexumMcpServer` with `retryAttempt` and `nextRetryAt`. Keep the existing experimental MCP endpoints and return Registry snapshots directly through the safe DTO boundary. Do not add credential fields or raw SDK errors. Preserve `needs_auth` as a separate non-retrying state.

- [ ] **Step 4: Initialize MCP state in the Client page**

In `packages/nexum-surfaces/src/main.tsx`, add an `onMount`-owned load that calls `client.experimental.nexum.mcp.list()`, stores the list, and refreshes while entries are `pending` or `retrying`. Stop the refresh loop on unmount or when no entry is in an in-progress state. Render a small MCP status section with retry count, OAuth action for `needs_auth`, and manual retry for `failed`; do not create transport or retry timers in the page.

- [ ] **Step 5: Run API, Client, Surface tests and typechecks**

Run:

```bash
cd packages/nexum-server
bun test test/mcp-api.test.ts
bun typecheck
cd ../nexum-client
bun test test/mcp.test.ts
bun typecheck
cd ../nexum-surfaces
bun typecheck
```

Expected: API payloads, Client paths, and page state handling pass without exposing credentials.

- [ ] **Step 6: Commit the Protocol/Server/Client task**

```bash
git add packages/nexum-protocol/src/index.ts packages/nexum-server/src/index.ts packages/nexum-client/src/index.ts packages/nexum-surfaces/src/main.tsx packages/nexum-server/test/mcp-api.test.ts packages/nexum-client/test/mcp.test.ts
git commit -m "feat(client): ✨ 展示 MCP 连接重试状态"
```

### Task 4: Documentation and final verification

**Files:**
- Modify: `docs/capabilities/mcp.md`
- Modify: `docs/README.md`
- Modify: `openspec/changes/mcp-retry/tasks.md`

- [ ] **Step 1: Document startup and retry lifecycle**

Document that Server/Runtime creates the MCP Registry at startup, restores persisted configs, connects asynchronously, and that Client only observes status. Include retry timings, terminal exclusions, OAuth behavior, and the manual retry action.

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
openspec validate mcp-retry --strict
cd packages/nexum-core && bun test && bun typecheck
cd ../nexum-application && bun test && bun typecheck
cd ../nexum-server && bun test && bun typecheck
cd ../nexum-client && bun test && bun typecheck
cd ../nexum-surfaces && bun typecheck
cd ../.. && bun run check
git diff --check
```

Expected: all affected tests, typechecks, lint, OpenSpec validation, and diff checks pass.

- [ ] **Step 3: Update OpenSpec and commit documentation**

Mark only verified tasks complete, inspect `git diff origin/dev-v0.0.1`, and commit:

```bash
git add docs/capabilities/mcp.md docs/README.md openspec/changes/mcp-retry/tasks.md
git commit -m "docs(mcp): ✨ 补充连接重试生命周期"
```
