# 本地工具双模式注册实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Nexum 提供可持久化恢复的本地 stdio MCP Server，以及可由 Runtime 直接注入的进程内 JS function calling，并让两者通过统一工具目录和权限执行链路工作。

**Architecture:** Core 定义带 `transport` 的 MCP 配置、稳定错误和本地函数端口；Integrations 负责 stdio MCP 子进程连接；Application 负责本地函数 Registry、幂等合并和统一工具绑定；Persistence 保存 MCP 配置和本地函数元数据，绝不序列化 JS `execute` 函数。Coding Loop 继续只依赖统一的 `ModelToolDefinition[]` 与 `ToolPort`。

**Tech Stack:** TypeScript、Bun、官方 `@modelcontextprotocol/sdk@1.32.1`、现有 MCP Registry、JSON 文件配置 Store、Bun Test、TypeScript typecheck。

---

## 文件职责

- 修改 `packages/nexum-core/src/mcp.ts`：扩展 MCP 配置为 HTTP/stdio 判别联合，保留远程配置兼容性，并补充来源和配置冲突所需的稳定类型。
- 新增 `packages/nexum-core/src/local-function.ts`：定义本地 JS 函数、provider、调用上下文和注册元数据端口，不依赖 Application 或 Integrations。
- 修改 `packages/nexum-core/src/index.ts`：导出本地函数端口，并让工具请求归一化可以识别 `local__` 工具来源。
- 修改 `packages/nexum-integrations/src/sdk-mcp.ts`：为 stdio 配置使用 `StdioClientTransport`，复用现有 MCP Client 到 `McpConnection` 的映射和工具变化通知。
- 修改 `packages/nexum-integrations/src/index.ts`：导出新类型或 Connector 入口。
- 新增 `packages/nexum-application/src/local-functions.ts`：把进程内 JS 函数编排为定义集合、稳定名称和执行绑定，处理重复 ID、Schema 冲突和缺少 handler。
- 修改 `packages/nexum-application/src/local-tools.ts`：合并本地函数定义和绑定，所有执行仍走统一 `ToolPort`、Session、Permission、超时和取消边界。
- 修改 `packages/nexum-application/src/index.ts`：增加 `mcpServers` 和 `localFunctions` Runtime 注入，启动时先幂等合并再恢复 MCP，向 Runtime 暴露本地函数元数据和刷新完成状态。
- 修改 `packages/nexum-persistence/src/mcp-store.ts`：支持 stdio 配置读写、规范化比较和旧 HTTP 配置兼容；如需要，增加本地函数元数据 Store。
- 修改 `packages/nexum-server/src/index.ts`：扩展实验性 MCP 注册 API 的请求解析，使 HTTP/stdio 配置共享内部 ensure 注册逻辑；不提供序列化 JS handler 的 HTTP 接口。
- 修改 `packages/nexum-server/test/mcp-api.test.ts`：覆盖 stdio 配置 API 的验证、持久化和生命周期控制。
- 新增或修改 `packages/nexum-integrations/test/mcp.test.ts`：覆盖 stdio 子进程 transport、初始化、工具发现、调用、退出和关闭。
- 新增或修改 `packages/nexum-application/test/local-functions.test.ts`：覆盖多函数、多 Schema、重复注入、冲突、缺少 handler 和执行上下文。
- 修改 `packages/nexum-application/test/mcp-tools.test.ts`：覆盖 MCP 与本地函数混合进入同一工具目录和动态刷新。
- 修改 `packages/nexum-core/test/tools.test.ts`：覆盖本地函数工具请求的权限资源归一化和统一执行路径。
- 更新 `docs/capabilities/mcp.md`、`docs/zh-CN/capabilities/mcp.md`：说明 HTTP/stdio MCP、启动恢复和注册 API。
- 新增 `docs/capabilities/local-functions.md`、`docs/zh-CN/capabilities/local-functions.md`：说明 Runtime 注入本地 JS 函数、Schema、权限、持久化边界和示例。
- 更新 `docs/zh-CN/examples/embedded-runtime.md`、`docs/zh-CN/examples/local-file-runtime.md`：补充两种本地工具注册用法。

### Task 1: 扩展 Core 类型与本地函数契约

**Files:**
- Modify: `packages/nexum-core/src/mcp.ts`
- Create: `packages/nexum-core/src/local-function.ts`
- Modify: `packages/nexum-core/src/index.ts`
- Test: `packages/nexum-core/test/mcp.test.ts`
- Test: `packages/nexum-core/test/local-function.test.ts`

- [ ] **Step 1: 写失败测试**

  在 Core 测试中先声明并断言以下契约：stdio 配置接受 `command/args/cwd`，HTTP 配置继续接受 `url`；本地函数定义能保留不同的 `parameters`；同一 provider 下不同函数有不同的稳定名称；缺失函数名、空 provider、同时提供 `url` 和 `command` 会被拒绝。

- [ ] **Step 2: 运行聚焦测试确认失败**

  Run: `cd packages/nexum-core && bun test test/mcp.test.ts test/local-function.test.ts`

  Expected: FAIL，因为当前 MCP 配置只有 `url`，且不存在本地函数契约。

- [ ] **Step 3: 实现最小 Core 契约**

  将 `McpServerConfig` 改成 HTTP/stdio 判别联合；保留现有 `id/name/disabled/timeoutMs` 语义。新增 `NexumLocalFunction`、`NexumLocalFunctionProvider`、`NexumLocalFunctionContext` 和注册元数据类型，`execute` 接受 `Record<string, unknown>` 与 `{ sessionID, signal }`。新增稳定的本地工具命名函数和配置校验，不引入 Application 依赖。

- [ ] **Step 4: 运行测试确认通过**

  Run: `cd packages/nexum-core && bun test test/mcp.test.ts test/local-function.test.ts && bun run typecheck`

  Expected: PASS，且既有远程 MCP 测试保持通过。

- [ ] **Step 5: 提交**

  `git add packages/nexum-core/src/mcp.ts packages/nexum-core/src/local-function.ts packages/nexum-core/src/index.ts packages/nexum-core/test/mcp.test.ts packages/nexum-core/test/local-function.test.ts && git commit -m "✨ feat(core): 增加双模式本地工具契约"`

### Task 2: 接入 stdio MCP Connector

**Files:**
- Modify: `packages/nexum-integrations/src/sdk-mcp.ts`
- Modify: `packages/nexum-integrations/src/index.ts`
- Test: `packages/nexum-integrations/test/mcp.test.ts`

- [ ] **Step 1: 写失败测试**

  使用一个测试用 stdio MCP Server 脚本，通过 `bun` 启动它，断言 Connector 能完成 `Client.connect()`、`listTools()`、`callTool()`、`onToolsChanged` 和 `close()`；断言 stdout 只包含协议内容，服务退出后连接回调被触发。

- [ ] **Step 2: 运行聚焦测试确认失败**

  Run: `cd packages/nexum-integrations && bun test test/mcp.test.ts`

  Expected: FAIL，因为当前 SDK Connector 只创建 `StreamableHTTPClientTransport`。

- [ ] **Step 3: 实现 stdio transport 分支**

  在 `createMcpSdkConnector()` 中根据 `config.transport` 选择 `StdioClientTransport` 或现有 HTTP transport。stdio 分支只传入结构化 `command/args/cwd/env`，不经过 shell；为 stdio 连接安装同样的工具变化和关闭监听，保留 `createConnection()` 的 `listTools/listResources/listPrompts/callTool` 映射。拒绝缺失命令、空参数和 HTTP-only 字段。

- [ ] **Step 4: 运行测试确认通过**

  Run: `cd packages/nexum-integrations && bun test test/mcp.test.ts && bun run typecheck`

  Expected: PASS，HTTP transport 回归测试和 stdio 测试均通过。

- [ ] **Step 5: 提交**

  `git add packages/nexum-integrations/src/sdk-mcp.ts packages/nexum-integrations/src/index.ts packages/nexum-integrations/test/mcp.test.ts && git commit -m "✨ feat(integrations): 支持本地 stdio MCP"`

### Task 3: 实现进程内本地 JS 函数 Registry

**Files:**
- Create: `packages/nexum-application/src/local-functions.ts`
- Modify: `packages/nexum-application/src/index.ts`
- Test: `packages/nexum-application/test/local-functions.test.ts`

- [ ] **Step 1: 写失败测试**

  注入 `get_weather` 和 `create_issue` 两个函数，断言它们拥有独立定义、独立参数 Schema 和 `local__provider__function` 名称；执行时断言输入、Session ID、AbortSignal 被传给正确 handler。重复注入相同定义必须复用；同名不同 Schema 必须报冲突；只存在持久化元数据但没有 handler 时必须不可执行。

- [ ] **Step 2: 运行聚焦测试确认失败**

  Run: `cd packages/nexum-application && bun test test/local-functions.test.ts`

  Expected: FAIL，因为当前 Application 没有本地函数 Registry。

- [ ] **Step 3: 实现 Registry**

  创建 `createNexumLocalFunctionRegistry()`，维护稳定 key、定义、handler 和可用状态。对函数名、provider ID、Schema 进行边界校验；生成只包含可用 handler 的模型定义；执行时找不到 binding 返回稳定失败结果，不直接抛出未处理异常。提供 `list`、`register`、`unregister`、`refresh` 和 `execute`，并提供变更订阅。

- [ ] **Step 4: 运行测试确认通过**

  Run: `cd packages/nexum-application && bun test test/local-functions.test.ts && bun run typecheck`

  Expected: PASS，所有冲突、缺失 handler 和执行上下文断言通过。

- [ ] **Step 5: 提交**

  `git add packages/nexum-application/src/local-functions.ts packages/nexum-application/test/local-functions.test.ts && git commit -m "✨ feat(application): 注册进程内本地函数"`

### Task 4: 合并统一 Tool Registry 与 Coding Loop

**Files:**
- Modify: `packages/nexum-application/src/local-tools.ts`
- Modify: `packages/nexum-application/src/index.ts`
- Modify: `packages/nexum-core/src/tools.ts`
- Test: `packages/nexum-application/test/mcp-tools.test.ts`
- Test: `packages/nexum-core/test/tools.test.ts`

- [ ] **Step 1: 写失败测试**

  创建同时包含内置工具、MCP 工具和本地 JS 函数的 Registry，断言所有定义被传给模型；分别调用 MCP 和本地 JS 工具，断言两者都经过统一 `ToolRequest`、权限资源和 Session 上下文。触发变更后断言定义集合原地刷新，下一次模型调用能看到新工具。

- [ ] **Step 2: 运行聚焦测试确认失败**

  Run: `cd packages/nexum-application && bun test test/mcp-tools.test.ts && cd ../nexum-core && bun test test/tools.test.ts`

  Expected: FAIL，因为当前 Registry 只维护内置工具和 MCP binding。

- [ ] **Step 3: 接入本地函数 binding**

  在 `createNexumToolRegistry()` 中增加可选本地函数 Registry；使用独立 binding Map 将 `local__...` 名称路由到本地函数执行器。保留 MCP 的去抖刷新，增加本地函数变更刷新，并确保 `definitions`、`names` 仍然原地更新，避免 Coding Loop 持有旧数组引用。对本地工具使用 `local.call` 权限动作和稳定函数名资源。

- [ ] **Step 4: 运行测试确认通过**

  Run: `cd packages/nexum-application && bun test test/mcp-tools.test.ts && cd ../nexum-core && bun test test/tools.test.ts`

  Expected: PASS，混合工具目录和统一执行边界均成立。

- [ ] **Step 5: 提交**

  `git add packages/nexum-application/src/local-tools.ts packages/nexum-application/src/index.ts packages/nexum-core/src/tools.ts packages/nexum-application/test/mcp-tools.test.ts packages/nexum-core/test/tools.test.ts && git commit -m "✨ feat(tool): 统一本地函数与 MCP 工具调用"`

### Task 5: Runtime 注入、持久化与幂等启动恢复

**Files:**
- Modify: `packages/nexum-application/src/index.ts`
- Modify: `packages/nexum-persistence/src/mcp-store.ts`
- Modify: `packages/nexum-core/src/mcp.ts`
- Test: `packages/nexum-application/test/runtime.test.ts`
- Test: `packages/nexum-persistence/test/mcp-store.test.ts`

- [ ] **Step 1: 写失败测试**

  测试 `createLocalRuntime({ mcpServers, localFunctions })`：首次启动持久化并装配配置；第二次启动相同配置不重复注册；相同 ID 不同配置返回冲突；本地 JS handler 不写入配置文件；重启时重新注入 handler 后恢复可用；stdio 与 HTTP 配置同时恢复。

- [ ] **Step 2: 运行聚焦测试确认失败**

  Run: `cd packages/nexum-application && bun test test/runtime.test.ts && cd ../nexum-persistence && bun test test/mcp-store.test.ts`

  Expected: FAIL，因为 Runtime 没有初始 MCP/本地函数参数，MCP Store 也只接受 URL 配置。

- [ ] **Step 3: 实现启动合并和存储**

  在 Runtime Options 增加 `mcpServers` 与 `localFunctions`；在 Local Runtime 创建 MCP Registry 后，先规范化并幂等合并初始配置，再调用现有恢复流程。将 `McpServerConfigStore.save/list` 扩展到 stdio 配置，并保持 JSON 文件版本兼容。为本地函数保存可恢复元数据，执行 handler 只从当前 Runtime 注入；初始配置与持久化配置冲突时默认失败，不静默覆盖。

- [ ] **Step 4: 运行测试确认通过**

  Run: `cd packages/nexum-application && bun test test/runtime.test.ts && cd ../nexum-persistence && bun test test/mcp-store.test.ts && bun run typecheck`

  Expected: PASS，启动恢复、重复注入、冲突和 handler 生命周期均符合设计。

- [ ] **Step 5: 提交**

  `git add packages/nexum-application/src/index.ts packages/nexum-persistence/src/mcp-store.ts packages/nexum-core/src/mcp.ts packages/nexum-application/test/runtime.test.ts packages/nexum-persistence/test/mcp-store.test.ts && git commit -m "✨ feat(runtime): 持久化恢复本地工具配置"`

### Task 6: 更新 API、文档并完成验证

**Files:**
- Modify: `packages/nexum-server/src/index.ts`
- Modify: `packages/nexum-server/test/mcp-api.test.ts`
- Modify: `docs/capabilities/mcp.md`
- Modify: `docs/zh-CN/capabilities/mcp.md`
- Create: `docs/capabilities/local-functions.md`
- Create: `docs/zh-CN/capabilities/local-functions.md`
- Modify: `docs/zh-CN/examples/embedded-runtime.md`
- Modify: `docs/zh-CN/examples/local-file-runtime.md`

- [ ] **Step 1: 写失败 API 测试**

  扩展 MCP API 测试，提交 `transport: "stdio"` 的注册请求，断言配置被保存且连接控制使用相同 Server ID；提交缺少 command、同时包含 url 和 command 的请求，断言返回 `NEXUM_MCP_INVALID_CONFIG`。确认现有 HTTP 注册请求和 OAuth 行为不变。

- [ ] **Step 2: 实现 API 解析和文档**

  扩展 `parseMcpServerConfig()` 解析 HTTP/stdio 判别联合，复用内部幂等注册逻辑；不增加通过 HTTP 传递 JS 函数体的接口。更新中英文 MCP 文档、Runtime 示例和本地函数文档，明确：stdio MCP 是独立子进程，本地 JS 函数只在当前 Runtime 有效，持久化只保存元数据。

- [ ] **Step 3: 运行包级测试**

  Run: `cd packages/nexum-server && bun test test/mcp-api.test.ts && cd ../nexum-integrations && bun test && cd ../nexum-application && bun test && cd ../nexum-core && bun test && cd ../nexum-persistence && bun test`

  Expected: PASS，所有相关包测试通过。

- [ ] **Step 4: 运行全量检查**

  Run: `bun run check`

  Expected: lint 与所有包 typecheck 通过。

- [ ] **Step 5: 检查文档与差异**

  Run: `git diff --check && rg -n "mcpServers|localFunctions|transport:.*stdio|local__" docs packages/nexum-* --glob '*.md' --glob '*.ts'`

  Expected: 文档示例、公开类型和实现使用同一参数名；无空白错误或遗留占位符。

- [ ] **Step 6: 提交**

  `git add packages/nexum-server/src/index.ts packages/nexum-server/test/mcp-api.test.ts docs/capabilities/mcp.md docs/zh-CN/capabilities/mcp.md docs/capabilities/local-functions.md docs/zh-CN/capabilities/local-functions.md docs/zh-CN/examples/embedded-runtime.md docs/zh-CN/examples/local-file-runtime.md && git commit -m "📝 docs: 完善双模式本地工具说明"`

## 最终验证与交付

- [ ] 在任务 worktree 执行 `bun run check`。
- [ ] 在受影响包目录执行对应 `bun test`，不得从仓库根目录运行测试。
- [ ] 检查 `git status --short`，确认只包含本任务变更及必要的 `.source_branch` 元数据。
- [ ] 按 `code-review-spec`、`verification-before-completion` 和项目域规则完成审查与修复。
- [ ] 记录最终测试证据、未解决限制和文档路径。
- [ ] 从任务 worktree 读取 `.source_branch`，确认 `features/✅MCP-001-T1--双模式工具注册` 已合并到 `dev-v0.0.1` 后，再执行 worktree 清理。
