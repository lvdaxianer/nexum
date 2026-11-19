# Headless Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use task-by-task TDD with the project development workflow and merge each task back to `dev-v0.0.1`.

**Goal:** 让 Headless UI 成为完成 Coding Task 的唯一页面控制台。

**Architecture:** 页面只调用 Headless Server 的 HTTP/SSE 接口；Server 负责凭据边界、Session 查询和模型 Probe；Core 继续负责 Coding Loop、工具、权限、Question 和上下文能力。

**Tech Stack:** Bun、TypeScript、Effect HTTP API、SolidJS、Vite、Playwright。

---

### Task 1: Runtime 控制端口

**Files:**
- Modify: `packages/headless-core/src/index.ts`
- Create/modify: `packages/headless-core/src/model-probe.ts`
- Test: `packages/headless-core/test/model-probe.test.ts`

- [ ] 先写模型 Probe 的失败测试：成功文本、成功 Function Calling、认证失败、非法响应和缺少配置。
- [ ] 运行 `bun test packages/headless-core/test/model-probe.test.ts`，确认因为 Probe 端口不存在而失败。
- [ ] 实现 Probe 端口和 Session 列表端口，保证不返回模型内容或凭据。
- [ ] 运行 Core 定向测试、`bun run --cwd packages/headless-core typecheck` 和 Core 全量测试。

### Task 2: Server、Protocol、Client 契约

**Files:**
- Modify: `packages/headless-server/src/index.ts`, `packages/headless-server/test/server.test.ts`
- Modify: `packages/protocol/src/groups/headless.ts`, `packages/client/src/promise/generated/*`
- Test: `packages/protocol/test/headless.test.ts`, `packages/client/test/headless-generated.test.ts`

- [ ] 先写 Session list 和 Model Probe HTTP 失败测试。
- [ ] 实现路由、稳定错误、traceId 和凭据不回显。
- [ ] 更新 Effect Schema/OpenAPI 与生成客户端接口。
- [ ] 运行 Server、Protocol、Client 定向测试和类型检查。

### Task 3: 页面唯一控制台

**Files:**
- Modify: `packages/headless-ui/src/main.tsx`, `packages/headless-ui/src/styles.css`
- Test: `packages/headless-ui/test/permission.smoke.spec.ts`

- [ ] 先扩展 Playwright smoke，覆盖 Probe、Session 切换、重连、取消和重复提交。
- [ ] 实现模型 Probe、Session 控制、事件恢复和错误状态。
- [ ] 将权限、Question、工具结果、压缩和项目上下文状态统一组织到页面。
- [ ] 运行 UI 类型检查、Vite 构建和 Playwright smoke。

### Task 4: 集成审计

**Files:**
- Modify: `docs/headless-core-poc.md`
- Verify: `openspec/changes/headless-control-plane/`

- [ ] 运行全部相关测试、`bunx openspec validate headless-control-plane --strict` 和 `git diff --check`。
- [ ] 完成代码评审、安全审计和真实模型 smoke。
- [ ] 更新页面启动与操作文档，归档 OpenSpec 并合并回 `dev-v0.0.1`。
