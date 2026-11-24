# MCP 生命周期实施计划

> 依据：`openspec/changes/mcp-lifecycle/` 的 proposal、design、specs 和 tasks。实现以 OpenCode `packages/core/src/mcp`、`mcp/oauth.ts`、`tool/mcp.ts` 的职责边界为参照。

## 目标

为 Nexum 增加可注册远程地址、可初始化、可 OAuth 授权、可恢复、可纳入工具注册和可安全关闭的 MCP 生命周期，同时保持现有无 MCP 启动路径和依赖方向不变。

## 交付顺序

1. Core/Schema 契约和 Registry 生命周期
2. 配置与 OAuth 凭据存储
3. 官方 MCP SDK 连接、目录发现、OAuth 和重连
4. Application 工具桥接、权限和 session 上下文
5. Protocol/Server/Client 控制 API 与生成客户端
6. Runtime 集成、文档、全量检查和交付审计

每个 OpenSpec 任务单独在任务 worktree 中完成：先写失败测试（RED），再实现（GREEN），最后运行受影响包 typecheck 和对应验证。每个任务完成后提交并合并到 `dev-v0.0.1`，下一任务从集成后的分支重新创建 worktree。

## T1：Core/Schema 契约和 Registry 生命周期

### 变更位置

- `packages/nexum-core/src/mcp.ts`：扩展配置、状态、目录和控制端口类型；保持既有端口的兼容使用方式。
- `packages/nexum-core/src/runtime.ts`：保留 MCP 所有权和关闭契约所需的类型边界，不在 Core 引入网络 SDK。
- `packages/nexum-core/test/mcp.test.ts`：新增状态、重复操作、并发 operation 和安全错误测试。
- `packages/nexum-core/test/runtime.test.ts`：补充 runtime close 对 MCP owner 的行为测试（仅在当前 Runtime 契约允许时）。

### 实施步骤

1. 先确认现有 MCP 导出、包入口和测试运行方式；不修改无关的运行时状态逻辑。
2. 写 RED：注册合法远程 Server；拒绝重复名称/非法 URL；验证 `disabled/pending/connected/failed/needs_auth`；验证同一 Server 的并发连接只保留一个 operation；验证 disconnect/remove/close 幂等且旧 operation 不能重新发布状态。
3. 设计最小接口：Core 只描述行为和数据，具体 Registry 若需要可放在 Application；不要在 Core 中创建 fetch、listener、SDK client 或 OAuth token。
4. 实现状态转换和安全错误摘要，确保 headers/token/code 不会出现在序列化状态和错误消息中。
5. 从 `packages/nexum-core` 运行 `bun test test/mcp.test.ts test/runtime.test.ts`，再运行 `bun typecheck`。

## 后续任务概要

- T2：配置存储、CredentialStore、脱敏和持久化重启测试。
- T3：`@modelcontextprotocol/client` Streamable HTTP、initialize/catalog/call、OAuth 双模式、refresh/401、session expired 和单飞重连。
- T4：统一 Tool Registry、Permission、session id、结果映射和 catalog 去抖刷新。
- T5：实验性 MCP HTTP API、OAuth 控制 API、Protocol 源与 `packages/client` 生成客户端、文档。
- T6：runtime/Server 集成、无 MCP 回归、关闭顺序、全量 `bun run check` 和审计。

## 验证与交付

- 每个任务必须包含实际测试或可观察验证，不接受只编译不运行的完成声明。
- 公共 Protocol/Server `HttpApi` 变化后，从 `packages/client` 执行 `bun run generate`，检查生成文件 diff。
- 最终从仓库根目录运行 `bun run check`，并从受影响包运行聚焦测试/typecheck；确认 `git diff origin/dev-v0.0.1`、依赖方向、日志脱敏、凭据隔离和 OpenSpec 状态。
