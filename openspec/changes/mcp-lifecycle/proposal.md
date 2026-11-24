# Proposal

## Why

当前 Nexum 只有一个由宿主注入 Transport 的简化 MCP Adapter，无法像 OpenCode 一样管理远程 MCP Server 的注册、初始化、OAuth、工具发现、重连和关闭。用户无法仅凭远程地址安装 MCP，也无法让发现的 MCP 工具进入模型工具链并经过 Permission。

现在补齐这条生命周期，是为了让 Nexum 的 MCP 能力与 OpenCode 的运行语义对齐，同时保持 Nexum 的 Core、Integrations、Application 和 Protocol 分层。

## What Changes

- 增加可持久化的远程 MCP Server 注册配置，支持 URL、Headers、协议协商和禁用状态。
- 增加 MCP Server Registry 与连接状态管理，支持注册、连接、断开、删除、启动恢复、失败重试和优雅关闭。
- 使用官方 MCP Client SDK 完成 initialize、工具/资源/Prompt 目录发现、调用和连接事件处理。
- 增加 OAuth Discovery、PKCE、浏览器回调、Redirect URL 粘贴兜底、Credential 持久化、Token 刷新和重新连接。
- 将发现的 MCP 工具接入统一 Tool Registry，调用前经过 Permission，并保留 Session 上下文和安全结果映射。
- 增加 MCP 的 Server/Client API，暴露注册、连接、授权状态、目录查询和断开能力。
- 保留现有未配置 MCP 时的可启动行为；未启用能力继续明确返回 disabled。
- 暂不实现连接池、Client-hosted MCP WebSocket 和 MCP Events cursor replay。

## Capabilities

### New Capabilities

- `mcp-lifecycle`: 远程 MCP Server 的配置注册、连接状态、目录发现、重连、断开和 Runtime 关闭。
- `mcp-oauth`: MCP 远程 Server 的 OAuth Discovery、授权回调、凭据保存、刷新和授权状态。
- `mcp-tool-bridge`: MCP 工具目录到统一 Tool Registry、Permission 和 Coding Loop 的桥接。
- `mcp-control-api`: MCP 注册、连接、断开、删除、授权和目录查询的 Protocol/Server/Client API。

### Modified Capabilities

- 无。

## Impact

- 影响 `packages/nexum-core`、`nexum-integrations`、`nexum-persistence`、`nexum-application`、`nexum-protocol`、`nexum-server` 和 `nexum-client`。
- 需要引入或升级 MCP 官方 Client SDK 依赖，并增加 OAuth/凭据存储边界。
- 需要同步 Runtime 能力发现、API 文档、模块文档和包级集成测试。
- 需要保证 Token、Headers、Authorization Code、PKCE Verifier 等敏感值不进入普通配置、事件、响应或日志。

