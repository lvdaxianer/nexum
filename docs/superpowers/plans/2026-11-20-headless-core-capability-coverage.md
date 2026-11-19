# Headless Core Capability Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不引入完整 OpenCode 产品层依赖的前提下，为 Headless POC 补齐并验证 Function Calling、上下文压缩、权限审批、Question 补充信息和项目上下文注入的完整链路。

**Architecture:** 以 `headless-core` 为领域边界，新增可替换的压缩、Question、项目上下文端口；Coding Loop 只维护一条统一 `ModelMessage` 历史。`headless-server` 通过 HTTP/SSE 暴露 pending/reply/事件，`headless-ui` 只消费生成客户端；fixture 模型验证确定性行为，真实模型 smoke 仅使用环境变量凭据。

**Tech Stack:** Bun、TypeScript、Solid/Vite、OpenAI-compatible Chat Completions、SSE、Bun Test、Playwright、OpenSpec。

---

### Task 1: 扩展 Headless 消息与端口契约

**Files:**

- Modify: `packages/headless-core/src/index.ts`
- Create: `packages/headless-core/src/context.ts`
- Create: `packages/headless-core/test/capability-contract.test.ts`
- Modify: `packages/headless-core/src/model.ts`

- [ ] **Step 1: Write the failing contract tests**

在 `capability-contract.test.ts` 中创建 Session，断言 `ModelPrompt.messages` 可包含 `system` project context，`ModelChunk` 可携带 `toolCalls`，并能构造压缩生命周期和 Question pending 事件；先引用尚不存在的 `createHeadlessContextCompaction` / `createHeadlessQuestionBroker`。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test test/capability-contract.test.ts`（cwd=`packages/headless-core`）。
Expected: FAIL，失败原因是新增端口工厂或契约尚未导出，而不是测试语法错误。

- [ ] **Step 3: Add minimal public contracts**

在 `index.ts` 增加 `ModelMessage` 的 `system` 分支、`ModelToolCall` 的统一表示、`HeadlessRuntimeEvent` 新事件数据类型；在 `context.ts` 导出：

```ts
export interface ContextCompactionPort {
  estimate(messages: readonly ModelMessage[]): number
  compact(input: { messages: readonly ModelMessage[]; keepRecent: number }): Promise<ContextCompactionResult>
}
export interface ProjectContextPort {
  load(sessionID: string): Promise<readonly ProjectContextEntry[]>
}
export interface QuestionPort {
  list(sessionID: string): Promise<readonly HeadlessQuestionRequest[]>
  reply(sessionID: string, requestID: string, answers: readonly (readonly string[])[]): Promise<ToolResult>
  cancel(sessionID: string, requestID: string): Promise<void>
}
```

所有端口返回不可变数据；不得让 Core 契约导入 UI、Server 或完整 `@opencode/core`。

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun test test/capability-contract.test.ts && bun run typecheck:tsc`（cwd=`packages/headless-core`）。
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/headless-core/src/index.ts packages/headless-core/src/context.ts packages/headless-core/src/model.ts packages/headless-core/test/capability-contract.test.ts
git commit -m "✨ feat(headless): 扩展核心能力端口契约"
```

### Task 2: 实现上下文压缩和项目上下文恢复

**Files:**

- Modify: `packages/headless-core/src/index.ts`
- Modify: `packages/headless-core/src/context.ts`
- Create: `packages/headless-core/test/context-compaction.test.ts`
- Modify: `packages/headless-core/test/coding-loop.test.ts`

- [ ] **Step 1: Write failing compaction tests**

覆盖三种行为：估算低于阈值时原样请求；超过阈值时发布 `context.compaction.started/completed` 并发送摘要+最近消息；压缩后模型再次返回工具调用时，完整 Function Calling 继续执行。另加摘要器失败时不执行工具并发布 `context.compaction.failed`。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test test/context-compaction.test.ts test/coding-loop.test.ts --test-name-pattern 'compaction|压缩'`。
Expected: 新增压缩断言 FAIL，现有 Coding Loop 测试继续 PASS。

- [ ] **Step 3: Implement the minimal compaction boundary**

在 `createHeadlessCodingLoop` options 中加入 `contextCompaction`、`projectContext`、`compactionThreshold` 和 `keepRecent`；每次 `ModelPort.prompt` 前调用估算器，超过阈值时调用 `compact`，将返回的 `summary`、`recentMessages` 和 project entries 合并为下一次消息历史，并发布有序事件。失败时保留原历史、发布失败事件并进入安全失败终态。

- [ ] **Step 4: Implement project context deduplication and restore**

按 `sourceID` 建立 Session 内去重集合；首次加载转换为 `system` 消息，压缩时保留 source metadata，恢复时只重新加载有效来源，读取失败不伪造内容。

- [ ] **Step 5: Run Core full verification**

Run: `bun test && bun run typecheck && bun run typecheck:tsc`（cwd=`packages/headless-core`）。
Expected: 新旧测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/headless-core/src packages/headless-core/test
git commit -m "✨ feat(headless): 增加上下文压缩与项目上下文恢复"
```

### Task 3: 实现 Question pending/reply/cancel

**Files:**

- Modify: `packages/headless-core/src/index.ts`
- Create: `packages/headless-core/src/question.ts`
- Create: `packages/headless-core/test/question.test.ts`
- Modify: `packages/headless-core/test/permission.test.ts`

- [ ] **Step 1: Write failing Question tests**

使用 fixture Model 返回 `question` 工具调用，断言 Question pending 后模型暂停；reply 后生成带同一 `toolCallID` 的 tool message；多题答案保持顺序；cancel 或重复 reply 不执行后续工具。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test test/question.test.ts`。
Expected: FAIL，原因是 Question broker 尚未创建或 Loop 尚未识别 `question` 调用。

- [ ] **Step 3: Implement the Question broker**

实现内存 pending 状态、唯一 request ID、list/reply/cancel；reply 只允许一次，返回结构化答案和模型可读文本，未知或重复请求返回稳定领域错误。

- [ ] **Step 4: Integrate Question into Coding Loop**

当工具名为 `question` 时，发布 `question.request` 并等待 `QuestionPort`；回答后发布 `question.result`，将答案加入消息历史再继续 ModelPort。取消转为 Session cancelled/failed，不执行依赖答案的工具。

- [ ] **Step 5: Run Core full verification**

Run: `bun test && bun run typecheck:tsc`（cwd=`packages/headless-core`）。
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/headless-core/src packages/headless-core/test
git commit -m "✨ feat(headless): 增加 Question 补充信息闭环"
```

### Task 4: 扩展 Server Protocol/API 和集成 fixture

**Files:**

- Modify: `packages/protocol/src/groups/headless.ts`
- Modify: `packages/headless-server/src/index.ts`
- Modify: `packages/headless-server/test/server.test.ts`
- Modify: `packages/client` generated outputs via repository generator

- [ ] **Step 1: Write failing API/integration tests**

在 Server fixture 中覆盖 Question list/reply/cancel、压缩事件、项目上下文和完整的 `Prompt → Question → Permission → Tool → Compaction → Completion` 链路；先断言新端点返回 404/405 或缺少事件。

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test test/server.test.ts --test-name-pattern 'Question|compaction|完整能力'`（cwd=`packages/headless-server`）。
Expected: FAIL，失败点为新 API/事件未实现。

- [ ] **Step 3: Add Protocol definitions and regenerate client**

在 `packages/protocol/src/groups/headless.ts` 增加 Session questions list/reply/cancel 和新增事件 payload；运行仓库生成命令，不手改 generated 文件。

- [ ] **Step 4: Implement HTTP/SSE handlers**

增加稳定错误码、trace ID、CORS 和请求校验；Question reply/cancel 只操作当前 Session 的 pending request，压缩事件通过同一 EventHub SSE 输出，响应不得包含凭据或完整上下文敏感内容。

- [ ] **Step 5: Run Server and generated checks**

Run: `bun test && bun run typecheck && bun run typecheck:tsc`（cwd=`packages/headless-server`）；`bun run check:generated && bun run typecheck:tsc`（cwd=`packages/protocol` 和 `packages/client`）。
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/protocol packages/client packages/headless-server
git commit -m "✨ feat(headless): 暴露 Question 与压缩运行协议"
```

### Task 5: UI 交互与页面级验收

**Files:**

- Modify: `packages/headless-ui/src/main.tsx`
- Modify: `packages/headless-ui/src/styles.css`
- Modify: `packages/headless-ui/test/permission.smoke.spec.ts`
- Create: `packages/headless-ui/test/capabilities.smoke.spec.ts`

- [ ] **Step 1: Write failing UI assertions**

扩展页面 smoke fixture，断言 Question 表单显示并提交回答、压缩状态进入时间线、项目上下文来源可见；断言权限拒绝后工具未落盘、回答后模型继续。

- [ ] **Step 2: Run UI test and verify RED**

Run: `bun run test:smoke`（cwd=`packages/headless-ui`，先执行 `bunx playwright install chromium`）。
Expected: 新增 locator 找不到或状态未出现而失败。

- [ ] **Step 3: Implement UI state and interactions**

增加 Question queue、回答/取消按钮、compaction status pill 和 source metadata；所有按钮在提交中禁用，重复回答不可提交，错误通过 notice 展示。

- [ ] **Step 4: Run UI verification**

Run: `bun run typecheck:tsc && bun run build && bun run test:smoke`（cwd=`packages/headless-ui`）。
Expected: PASS；浏览器断言不依赖本地文件执行权限。

- [ ] **Step 5: Commit**

```bash
git add packages/headless-ui
git commit -m "✨ feat(headless): 完成核心能力 UI 验收"
```

### Task 6: 真实模型 Smoke、安全审计与最终集成

**Files:**

- Create: `scripts/headless-real-smoke.ts`
- Modify: `apis/headless.md`
- Modify: `openspec/changes/headless-core-capability-coverage/tasks.md`

- [ ] **Step 1: Write failing/guard tests for smoke configuration**

断言 smoke 在缺少 `HEADLESS_MODEL_API_KEY` 时拒绝启动，在提供环境变量时只通过内存配置发送请求；扫描 stdout/stderr 和结果摘要不得出现凭据值。

- [ ] **Step 2: Implement secure real-model smoke**

脚本读取 `HEADLESS_MODEL_BASE_URL`、`HEADLESS_MODEL_NAME`、`HEADLESS_MODEL_API_KEY`，创建临时 Session，发送普通 Prompt 和可选工具 Prompt，只输出状态码、错误码、工具名称和事件类型；任何异常只打印脱敏消息。

- [ ] **Step 3: Run final verification**

Run Core/Server/UI/Protocol/Client tests and typechecks, `bunx openspec validate headless-core-capability-coverage --strict`, `git diff --check`, and repository secret scan. If the external token returns authentication failure, record it as an external credential blocker without exposing the token.

- [ ] **Step 4: Update docs and task markers**

记录 fixture、Question、压缩、权限和真实 smoke 命令；每个任务通过独立审计后将对应 checkbox 标记为 `[x]`。

- [ ] **Step 5: Commit and integrate**

```bash
git add scripts/headless-real-smoke.ts apis/headless.md openspec/changes/headless-core-capability-coverage/tasks.md
git commit -m "✨ test(headless): 完成核心能力全链路验收"
```

完成后按 `.source_branch` 合并回 `dev-v0.0.1`，运行最终集成门禁并归档 OpenSpec 变更。
