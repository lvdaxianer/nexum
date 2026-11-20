# Headless Skill Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将完整目录型 Skill 注册到项目内 Headless Runtime，并让任意 UI 通过 `@skill` 调用、查看权限和运行安全验证。

**Architecture:** `packages/headless-core` 提供 UI 无关的 Skill Registry、路径安全、摘要校验和 Prompt mention resolver；`packages/headless-server` 暴露管理与激活 API；`packages/headless-ui` 只消费生成客户端并提供 Skill 管理、自动补全与验证结果。Skill 的副作用仍由现有 coding loop/tool/Permission 承载。

**Tech Stack:** Bun、TypeScript、Effect Schema、OpenAPI 生成客户端、React/Vite、Playwright smoke、Python `unittest` Skill evals。

---

### Task 1: 项目 Skill 包与 Core Registry

**Files:**
- Create: `skills/metric-view-lifecycle/**`（从已验证的本机完整目录复制，保留 `SKILL.md`、`README.md`、`agents/`、`references/`、`scripts/`、`evals/`）
- Create: `packages/headless-core/src/skill-registry.ts`
- Modify: `packages/headless-core/src/index.ts`
- Test: `packages/headless-core/test/skill-registry.test.ts`
- Test: `packages/headless-core/test/package-boundary.test.ts`

- [ ] **Step 1: Write the failing tests**

  覆盖：发现完整 Skill、稳定 digest、拒绝缺失 `SKILL.md`、拒绝 `..`/符号链接逃逸、重复 ID 进入 conflict、验证摘要脱敏。测试使用 `mkdtemp` fixture，不访问真实网络和数据库。

- [ ] **Step 2: Run RED**

  Run: `bun test --cwd packages/headless-core test/skill-registry.test.ts`
  Expected: FAIL because `SkillRegistry` port and implementation do not exist.

- [ ] **Step 3: Implement minimal GREEN**

  增加 `SkillRegistryPort`、`SkillSummary`、`SkillPackage` 和稳定错误类型；只读取配置 roots 内文件，计算相对文件 manifest 和 digest，禁止把绝对路径放进 summary；在 `index.ts` 导出端口。

- [ ] **Step 4: Run focused and broader checks**

  Run: `bun test --cwd packages/headless-core test/skill-registry.test.ts && bun test --cwd packages/headless-core && bun run --cwd packages/headless-core typecheck`
  Expected: focused tests and existing Core suite pass; package boundary remains UI-independent.

- [ ] **Step 5: Audit and commit**

  检查 diff 只包含 Skill 包、Registry 和测试；运行 `git diff --check` 与 `git ls-files` secret audit；完成 `code-review-spec`、per-task audit 后提交。

### Task 2: Skill Prompt 与权限生命周期

**Files:**
- Create: `packages/headless-core/src/skill-invocation.ts`
- Modify: `packages/headless-core/src/coding-loop.ts` 或当前 Prompt admission 组合入口
- Modify: `packages/headless-core/src/permission.ts`
- Test: `packages/headless-core/test/skill-invocation.test.ts`
- Test: `packages/headless-core/test/capability-matrix.test.ts`

- [ ] **Step 1: Write the failing tests**

  覆盖 `@metric-view-lifecycle` mention range、未知 Skill、重复 mention 去重、Skill content 注入、`skill.use` deny、pending permission cancel 和 ordered activation event。

- [ ] **Step 2: Run RED**

  Run: `bun test --cwd packages/headless-core test/skill-invocation.test.ts`
  Expected: FAIL because Headless Prompt does not accept Skill attachments or resolve mentions.

- [ ] **Step 3: Implement minimal GREEN**

  让 Prompt admission 调用 Registry resolver，生成 `{ id, mention, text }` attachment；Skill activation 经过 `skill.use` 规则，失败/取消关闭 pending 状态，工具副作用继续调用现有 Tool/Permission。

- [ ] **Step 4: Run focused and broader checks**

  Run: `bun test --cwd packages/headless-core test/skill-invocation.test.ts test/capability-matrix.test.ts && bun test --cwd packages/headless-core && bun run --cwd packages/headless-core typecheck`
  Expected: skill tests and all existing function calling/permission/question/compaction tests pass.

- [ ] **Step 5: Audit and commit**

  复核 no secret in prompt/events/logs、unknown/denied/cancel terminal semantics、无绕过工具权限的调用；完成 per-task audit 后提交。

### Task 3: Headless API 与客户端契约

**Files:**
- Modify: `packages/headless-server/src/index.ts`
- Modify: `packages/protocol/src/groups/headless.ts`
- Modify: `packages/client/src/promise/generated/*`
- Modify: `packages/client/src/effect/generated/*`
- Modify: `packages/client/src/effect/api/api.ts`
- Modify: `apis/headless.md`
- Test: `packages/headless-server/test/server.test.ts`
- Test: `packages/protocol/test/headless.test.ts`
- Test: `packages/client/test/headless-generated.test.ts`

- [ ] **Step 1: Write the failing HTTP/contract tests**

  覆盖 list/detail/register/refresh/validate/activate、非法 root、重复注册、脱敏 error、traceId、Skill attachment prompt payload。

- [ ] **Step 2: Run RED**

  Run: `bun test --cwd packages/headless-server test/server.test.ts`
  Expected: FAIL with missing Headless Skill routes.

- [ ] **Step 3: Implement and generate**

  在 protocol 中定义 Schema 和 OpenAPI operation，Server 只调用 Core port，运行 `bun run generate` 更新 promise/effect client，并为受影响模块补齐 `apis/headless.md`。

- [ ] **Step 4: Run broader checks**

  Run: `bun test --cwd packages/headless-server && bun test --cwd packages/protocol --no-cache && bun test --cwd packages/client test/headless-generated.test.ts && bun run --cwd packages/client check:generated`
  Expected: all pass and generated client has no diff.

- [ ] **Step 5: Audit and commit**

  按 backend-reliability 与 REST API 文档规范检查路径约束、错误、幂等、超时、凭据和文档覆盖；完成 per-task audit 后提交。

### Task 4: 页面控制台

**Files:**
- Modify: `packages/headless-ui/src/main.tsx`
- Modify: `packages/headless-ui/src/styles.css`
- Test: `packages/headless-ui/test/permission.smoke.spec.ts`

- [ ] **Step 1: Write the failing smoke test**

  覆盖页面加载 Skill 列表、输入 `@metric-view-lifecycle` 出现补全、激活后显示 Skill chip、点击 Validate 显示 pass/fail、刷新后恢复激活状态和错误可重试。

- [ ] **Step 2: Run RED**

  Run: `bun run --cwd packages/headless-ui test:smoke`
  Expected: FAIL because Skill panel and `@` autocomplete do not exist.

- [ ] **Step 3: Implement minimal UI**

  只通过 generated client 调用 Skill API；为输入框增加 `@` token 建议、选择状态、验证 loading/error/success、无 Skill/失败状态和 `aria-live`；禁止把 Skill root path 或敏感诊断渲染到 DOM。

- [ ] **Step 4: Run UI verification**

  Run: `bunx tsc --noEmit -p packages/headless-ui/tsconfig.json && bun run --cwd packages/headless-ui build && bun run --cwd packages/headless-ui test:smoke`
  Expected: typecheck, production build, and all existing/new smoke tests pass.

- [ ] **Step 5: Audit and commit**

  按 frontend-interaction 规范检查键盘、loading、空态、错误恢复、可访问性和重复提交；完成 per-task audit 后提交。

### Task 5: Skill 实测与集成收口

**Files:**
- Modify: `openspec/changes/headless-skill-registry/tasks.md`
- Modify: `docs/headless-core-poc.md`
- Test: `skills/metric-view-lifecycle/scripts/test_*.py`

- [ ] **Step 1: Run complete Skill package verification**

  Run from `skills/metric-view-lifecycle`: `python3 scripts/check_contract_drift.py && for test_file in scripts/test_*.py; do PYTHONPATH=scripts python3 "$test_file" || exit 1; done`
  Expected: contract drift `{ "ok": true }` and all local tests pass; no real token/database access.

- [ ] **Step 2: Run Headless page-to-Core Skill smoke**

  Start the Headless Server/UI, use the page to register/select `metric-view-lifecycle`, submit a prompt with `@metric-view-lifecycle`, observe the Skill activation event, and verify Permission/Question/cancel behavior.

- [ ] **Step 3: Run final audit**

  Run all Core/Server/Protocol/Client/UI suites, OpenSpec strict validation, generated-client check, `git diff --check`, secret audit, and inspect the rendered page.

- [ ] **Step 4: Mark task complete, commit, merge, archive**

  Mark only the verified task checkbox, commit with `commit --style=full`, merge each task into `dev-v0.0.1`, remove task worktrees, archive the OpenSpec change, and verify the integration branch is clean.
