# Nexum Runtime-first 能力建设实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏 Nexum 包边界的前提下，补齐可恢复执行、安全 Host、Provider、持久化演进、Automation 和扩展协议能力。

**Architecture:** 先完成 Core/Server 已有运行语义的验收和恢复边界，再把环境能力放入 Persistence/Integrations/Application，最后通过 Protocol/Client 暴露给 CLI、Web、ACP 和未来 Desktop。每个独立能力使用自己的 OpenSpec change 和任务 worktree，集成分支固定为 `dev-v0.0.1`。

**Tech Stack:** Bun、TypeScript、OpenSpec、SQLite/文件 Persistence、HTTP/SSE、MCP SDK、现有 Nexum Protocol/Client/Server。

**Design:** `docs/superpowers/specs/2026-11-26-nexum-runtime-roadmap-design.md`

---

## 交付顺序

### Phase 0：基线与遗留变更收敛

- 先完成现有 `headless-session-run-feedback` 的 Nexum 等价验证，不按已迁移失效的 `packages/headless-*` 路径伪造验收；
- 完成 `nexum-skill-management-role-prompt` 剩余事件/UI/浏览器任务；
- 完成 `directory-readmes` 的审查、提交和归档；
- 对每项变更执行 `openspec validate --strict`、受影响包测试、`bun run check`、代码审查和工作树审计。

### Phase 1：Durable execution 与 Host 安全

#### Task 1：定义运行恢复模型

**目标：** 把当前进程内 active run 扩展成可恢复的运行记录，但不把进程锁误当作分布式所有权。

**文件：**

- Create: `openspec/changes/session-execution-recovery/proposal.md`
- Create: `openspec/changes/session-execution-recovery/design.md`
- Create: `openspec/changes/session-execution-recovery/specs/session-execution-recovery/spec.md`
- Create: `openspec/changes/session-execution-recovery/tasks.md`
- Modify: `packages/nexum-core/src/index.ts`
- Modify: `packages/nexum-core/src/runtime.ts`
- Modify: `packages/nexum-persistence/src/index.ts`
- Modify: `packages/nexum-application/src/index.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-core/test/run-lifecycle.test.ts`
- Test: `packages/nexum-application/test/runtime.test.ts`
- Test: `packages/nexum-server/test/server.test.ts`

**验收：**

- Admission 生成幂等 execution ID；
- running claim 只表达本地恢复标记，不提供集群 fencing；
- 正常完成、失败、用户取消释放 claim；进程退出保留 claim；
- 重启恢复只恢复有可继续上下文的 Session，且每次恢复尝试有 durable attempt 计数；
- 同一 Session 的并发 Prompt/Continue 不重复执行；不同 Session 可以并行；
- API 提供稳定的 recovery 状态，不暴露内部锁和文件路径。

**验证：**

```bash
cd packages/nexum-core && bun test test/run-lifecycle.test.ts test/cancellation.test.ts
cd ../nexum-application && bun test test/runtime.test.ts
cd ../nexum-server && bun test test/server.test.ts
bun run check
```

#### Task 2：统一 Host 风险与沙箱接口

**目标：** 将文件、Shell、网络执行纳入统一 Host/Sandbox 边界。

**文件：**

- Modify: `packages/nexum-core/src/host.ts`
- Modify: `packages/nexum-core/src/permission.ts`
- Modify: `packages/nexum-integrations/src/local-host.ts`
- Create: `packages/nexum-integrations/src/sandbox.ts`
- Modify: `packages/nexum-application/src/local-tools.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-core/test/tools.test.ts`
- Test: `packages/nexum-core/test/permission-policy.test.ts`
- Test: `packages/nexum-application/test/runtime.test.ts`
- Test: `packages/nexum-server/test/server.test.ts`

**验收：**

- 文件读写、Shell、网络请求使用统一 resource/action/risk 归一化；
- 重定向、子 Shell、符号链接、环境变量和 credential-bearing URL 不得绕过 Permission；
- 输出、环境变量、请求 Headers 和错误详情有长度和脱敏边界；
- 默认本地 Host 保持开发可用，沙箱通过 Port 注入，不把 Docker 依赖放进 Core；
- 取消、超时和关闭都等待子进程清理完成后才发布终态。

**验证：**

```bash
cd packages/nexum-core && bun test test/tools.test.ts test/permission-policy.test.ts
cd ../nexum-application && bun test test/runtime.test.ts
cd ../nexum-server && bun test test/server.test.ts test/logger.test.ts
bun run check
```

### Phase 2：Provider 与 Session 数据演进

#### Task 3：Provider Adapter 和模型目录

**目标：** 让 Provider 差异留在 Integrations，并统一能力、错误、重试、usage 和 cost。

**文件：**

- Modify: `packages/nexum-core/src/model.ts`
- Modify: `packages/nexum-core/src/model-probe.ts`
- Create: `packages/nexum-integrations/src/provider-catalog.ts`
- Create: `packages/nexum-integrations/src/provider-adapters.ts`
- Modify: `packages/nexum-integrations/src/openai-model.ts`
- Modify: `packages/nexum-persistence/src/index.ts`
- Modify: `packages/nexum-application/src/index.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Test: `packages/nexum-core/test/model-adapter.test.ts`
- Test: `packages/nexum-core/test/model-probe.test.ts`
- Test: `packages/nexum-application/test/runtime.test.ts`
- Test: `packages/nexum-server/test/server.test.ts`

**验收：** Provider 能力、模型列表、错误分类、retry-after、reasoning、Token 和成本均有稳定 DTO；新增 Provider 不需要修改 Core Coding Loop；敏感 credential 不进入列表、事件或日志。

#### Task 4：Session Schema Migration、Archive 和 Export

**目标：** 让 Session/Message/Event 数据支持版本演进和大历史恢复。

**文件：**

- Modify: `packages/nexum-persistence/src/index.ts`
- Modify: `packages/nexum-persistence-sqlite/src/index.ts`
- Modify: `packages/nexum-persistence-file/src/index.ts`
- Modify: `packages/nexum-core/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Modify: `apis/nexum.md`
- Test: `packages/nexum-persistence/test/*.test.ts`
- Test: `packages/nexum-server/test/server.test.ts`

**验收：** 旧版本数据可迁移或给出稳定不可恢复错误；Archive 不改变业务更新时间；历史分页有 cursor/snapshot；事件 cursor 丢失时能以 canonical history 重建；导入导出默认脱敏且可校验完整性。

### Phase 3：Automation 与扩展协议

#### Task 5：Automation Scheduler

**目标：** 提供定时、事件触发和 SessionIdle 后台任务，并保证幂等、取消和恢复。

**文件：**

- Create: `packages/nexum-core/src/automation.ts`
- Create: `packages/nexum-application/src/automation.ts`
- Modify: `packages/nexum-persistence/src/index.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Test: `packages/nexum-core/test/automation.test.ts`
- Test: `packages/nexum-application/test/automation.test.ts`
- Test: `packages/nexum-server/test/automation-api.test.ts`

**验收：** 每个 Automation 有持久化 ID、触发记录、attempt、nextRunAt、状态和取消语义；重启不会重复执行同一 operation；后台任务仍经过 Session/Permission/Host；默认不阻塞 Server 启动。

#### Task 6：Plugin Runtime 与 ACP

**目标：** 建立插件生命周期和 ACP 适配边界。

**文件：**

- Create: `packages/nexum-core/src/plugin.ts`
- Create: `packages/nexum-integrations/src/plugin-host.ts`
- Create: `packages/nexum-application/src/plugin-registry.ts`
- Create: `packages/nexum-protocol/src/acp.ts`
- Create: `packages/nexum-server/src/acp.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Test: `packages/nexum-application/test/plugin-registry.test.ts`
- Test: `packages/nexum-server/test/acp.test.ts`

**验收：** 插件声明能力和权限；插件启动、失败、关闭、升级和取消可观察；插件不能绕过 Tool Registry 写入 Session；ACP 映射保持事件顺序、图片/二进制引用和终态一致。

#### Task 7：MCP 能力补齐

**目标：** 在现有 MCP 生命周期基础上补齐文件传输、OAuth 边界、catalog 订阅和工具调用诊断。

**文件：**

- Modify: `packages/nexum-core/src/mcp.ts`
- Modify: `packages/nexum-integrations/src/sdk-mcp.ts`
- Modify: `packages/nexum-integrations/src/oauth.ts`
- Modify: `packages/nexum-application/src/local-tools.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-core/test/mcp.test.ts`
- Test: `packages/nexum-application/test/mcp-tools.test.ts`
- Test: `packages/nexum-server/test/mcp-api.test.ts`

**验收：** OAuth refresh 保留必要 scope；订阅流结束后可恢复；redirect fallback 不挂死；文件/资源引用不把本地路径泄露到公开 DTO；MCP Tool 统一经过 Permission 和 session context。

### Phase 4：Service、诊断与 Surface

#### Task 8：Service Health、Remote Attach 和配置热加载

**目标：** 让本地 Runtime 可被 CLI、ACP、Desktop 和远程 Client 可靠复用。

**文件：**

- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-client/src/index.ts`
- Create: `packages/nexum-application/src/service-lifecycle.ts`
- Test: `packages/nexum-server/test/server.test.ts`
- Test: `packages/nexum-client/test/client.test.ts`

**验收：** readiness 与 liveness 分离；SSE 心跳和 reconnect 有界；配置热加载不丢失 Permission/Provider/MCP 约束；远程模式强制认证；CLI/ACP attach 到同一服务不重复启动后台任务。

#### Task 9：统一诊断和资源指标

**目标：** 为运行、Provider、Tool、MCP、Automation 提供统一 trace、耗时、Token、成本和资源诊断。

**文件：**

- Create: `packages/nexum-core/src/observability.ts`
- Modify: `packages/nexum-server/src/logger.ts`
- Modify: `packages/nexum-protocol/src/index.ts`
- Modify: `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-server/test/logger.test.ts`
- Test: `packages/nexum-core/test/runtime-event.test.ts`

**验收：** 诊断字段有长度上限和敏感字段拒绝列表；普通日志不记录高频流式 delta；事件、日志和 API 响应可按 traceId 关联；内存、队列、连接和执行耗时有明确上限或统计。

#### Task 10：Surface 适配与产品化验证

**目标：** 复用 Protocol/Client，把 CLI、Web、TUI、Desktop 的差异限制在 Surface/Host。

**文件：**

- Modify: `packages/nexum-surface-adapter/src/index.ts`
- Modify: `packages/nexum-chat-surface/src/chat-surface.tsx`
- Modify: `packages/nexum-cli/src/*.ts`
- Modify: `packages/nexum-surfaces/src/*.tsx`
- Test: `packages/nexum-chat-surface/test/*.test.ts`
- Test: `packages/nexum-cli/test/*.test.ts`
- Test: `packages/nexum-surfaces/test/*.spec.ts`

**验收：** loading/empty/error/reconnect/cancelled/orphaned 状态一致；Surface 不重复实现运行策略；键盘、剪贴板、文件和窗口能力走 Host；先完成 Web/CLI/TUI 基线，再评估 Desktop/Mobile。

## 每个任务的强制流程

1. 在集成分支创建独立 `features/✅CHG-001-TN--任务名` 或 `fixes/✅BUG-001-TN--任务名` worktree；
2. 先更新 OpenSpec proposal/design/spec/tasks；
3. 对行为变化先写最小失败测试并确认 RED；
4. 实现最小 GREEN 版本，再做重构；
5. 运行受影响包测试、`bun run check`、必要的 `typecheck:tsc` 和真实服务验证；
6. 执行代码审查、领域技能审查、敏感信息/依赖方向审计；
7. 标记 OpenSpec task、创建中文 Conventional Commit、合并回 `dev-v0.0.1`；
8. 完成所有任务后归档 OpenSpec，并对集成分支做最终审计。

## 当前执行切片

本次先执行 Phase 0 的基线收敛，并以当前 Nexum 路径补齐旧 OpenSpec 的等价验证；随后进入 Phase 1 Task 1。任何旧 Headless 路径、已迁移包名或历史测试命令都必须在任务文档中明确替换，不能以不存在的文件作为完成证据。
