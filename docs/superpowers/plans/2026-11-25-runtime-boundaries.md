# 运行边界加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Nexum 服务、Shell Host、模型 Probe 和 MCP URL 建立可验证的认证、资源、超时和网络访问边界。

**Architecture:** 服务层只负责请求认证和生命周期 deadline；Core 的 Model Probe 通过 `AbortSignal` 传播取消；Integration 层负责本地文件 canonicalization、输出裁剪和外部 URL 校验。默认回环开发行为保持兼容，非回环部署 fail fast。

**Tech Stack:** Bun、TypeScript、Web Fetch API、Node `fs/promises`、Bun test。

---

### Task 1: 服务认证边界

**Files:**
- Modify: `packages/nexum-server/src/index.ts:90-250`
- Test: `packages/nexum-server/test/server.test.ts`

- [x] **Step 1: 写失败测试**

增加测试：非回环 hostname 没有 token 时 `startNexumServer` 拒绝启动；配置 token 后，无 token 的业务请求返回 401，正确 Bearer token 可访问；回环服务仍可无 token 访问。

- [x] **Step 2: 运行 focused test 确认失败**

运行：`bun test test/server.test.ts -t "requires authentication"`

预期：当前实现没有 `authToken` 选项，测试失败。

- [x] **Step 3: 实现最小认证边界**

在 `NexumServerOptions` 增加 `authToken?: string`，对非回环 hostname 做启动校验；在 `Bun.serve.fetch` 中对健康检查以外的请求校验 `Authorization: Bearer`，错误使用现有稳定响应格式；CORS 增加 authorization 允许头。

- [x] **Step 4: 运行测试确认通过**

运行：`bun test test/server.test.ts -t "requires authentication|keeps loopback requests local"`

预期：新增测试通过，原有 server 测试不回归。

- [x] **Step 5: 提交**

提交：`🐛 fix(server): 加固非回环服务认证边界`

### Task 2: Local Host 资源和路径边界

**Files:**
- Modify: `packages/nexum-integrations/src/local-host.ts`
- Test: `packages/nexum-integrations/test/local-host.test.ts`

- [x] **Step 1: 写失败测试**

覆盖最大输出、最大读取大小、最大写入大小以及工作目录内符号链接指向外部文件时拒绝 read/write。

- [x] **Step 2: 运行 focused test 确认失败**

运行：`bun test test/local-host.test.ts -t "bounds|symlink|output"`

预期：当前实现会返回完整输出并允许符号链接路径。

- [x] **Step 3: 实现最小边界**

增加 `maxReadBytes`、`maxWriteBytes`、`maxOutputBytes` 配置；使用真实路径检查读写边界；输出捕获使用有界 chunk 缓冲，超限后继续 drain 并追加截断标记。

- [x] **Step 4: 运行测试确认通过**

运行：`bun test test/local-host.test.ts`

预期：新增和已有 Shell 生命周期测试全部通过。

- [x] **Step 5: 提交**

提交：`🐛 fix(integrations): 限制本地 Host 资源和路径`

### Task 3: Model Probe deadline

**Files:**
- Modify: `packages/nexum-core/src/model-probe.ts`, `packages/nexum-server/src/index.ts`
- Test: `packages/nexum-core/test/model-probe.test.ts`, `packages/nexum-server/test/server.test.ts`

- [x] **Step 1: 写失败测试**

增加一个不产生 chunk 的模型，验证 Probe 在 deadline 到期后返回 `NexumModelProbeError` 的 timeout code；server probe 使用请求 signal 时可以被取消。

- [x] **Step 2: 运行 focused test 确认失败**

运行：`bun test packages/nexum-core/test/model-probe.test.ts packages/nexum-server/test/server.test.ts -t "timeout|deadline"`

预期：当前 Probe 没有 deadline，测试会挂起或未按预期失败。

- [x] **Step 3: 实现最小 deadline**

为 Probe 输入增加 `signal` 和 `timeoutMs`，在端口内部创建 deadline controller，并将 signal 传给两次模型 prompt；server 将请求取消信号和固定上限传入 Probe，超时映射到稳定 503 错误。

- [x] **Step 4: 运行测试确认通过**

运行：`bun test packages/nexum-core/test/model-probe.test.ts packages/nexum-server/test/server.test.ts`

预期：Probe 正常能力测试和 timeout 测试全部通过。

- [x] **Step 5: 提交**

提交：`🐛 fix(core): 为模型探测增加取消和超时`

### Task 4: MCP URL 网络边界

**Files:**
- Modify: `packages/nexum-core/src/mcp.ts`
- Test: `packages/nexum-core/test/mcp.test.ts`, `packages/nexum-server/test/mcp-api.test.ts`

- [ ] **Step 1: 写失败测试**

增加 localhost、127.0.0.1、私有网段、链路本地地址、userinfo、query 和 fragment 的拒绝测试。

- [ ] **Step 2: 运行 focused test 确认失败**

运行：`bun test packages/nexum-core/test/mcp.test.ts packages/nexum-server/test/mcp-api.test.ts -t "private|userinfo|query|fragment"`

预期：当前实现只拒绝非 HTTP(S) 和 userinfo，其他场景会通过。

- [ ] **Step 3: 实现 URL 校验**

在配置归一化边界拒绝明确的本地/私网/元数据主机和 query/fragment；保留公共 HTTP(S) MCP 的现有行为。

- [ ] **Step 4: 运行测试确认通过**

运行：`bun test packages/nexum-core/test/mcp.test.ts packages/nexum-server/test/mcp-api.test.ts`

预期：MCP 生命周期、持久化和拒绝场景全部通过。

- [ ] **Step 5: 提交**

提交：`🐛 fix(core): 拒绝不安全的 MCP 地址`

### Task 5: 任务审计与集成

**Files:**
- Verify: 全部 Task 1-4 变更

- [ ] **Step 1: 运行受影响 package 测试**

运行：`bun test`，分别从 `packages/nexum-server`、`packages/nexum-integrations`、`packages/nexum-core` 目录执行。

- [ ] **Step 2: 运行全量检查**

运行：`bun run check`。

- [ ] **Step 3: 执行代码审查门禁**

逐项复核 code-review-spec、backend-reliability-guidelines、logging-boundaries、frontend-interaction-guidelines 适用项，并确认没有修改用户未跟踪文件。

- [ ] **Step 4: 标记任务并合并**

完成审计后更新任务清单，按 commit skill 提交，并将任务分支合并回 `dev-v0.0.1`。
