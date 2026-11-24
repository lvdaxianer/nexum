## Purpose

提供与 OpenCode 对齐的 MCP 控制面 API，让客户端可以注册、连接、断开、移除和观察远程 MCP，同时不暴露凭据。

## ADDED Requirements

### Requirement: Expose MCP lifecycle controls
Server API MUST 支持列出、注册、移除、连接和断开 MCP Server；输入 MUST 在边界校验，重复操作 MUST 返回稳定结果或稳定错误。

#### Scenario: Register and connect a remote server
- **WHEN** 客户端提交合法的远程 URL 和 Server 配置
- **THEN** API 返回注册状态，并允许后续连接操作观察初始化结果

### Requirement: Expose OAuth authorization controls
当 MCP Server 需要 OAuth 时，API MUST 提供启动、查询、完成和取消授权尝试的控制面；授权接口 MUST 使用实验性命名空间并返回可操作状态。

#### Scenario: Authorization requires user interaction
- **WHEN** MCP 连接进入 `needs_auth` 并创建授权尝试
- **THEN** 客户端可获取授权 URL 或 redirect paste 提示，并可完成或取消该尝试

### Requirement: Reflect runtime state without secrets
MCP 列表、工具、资源、提示词和能力 API MUST 反映当前运行时状态，且响应、事件和错误 MUST 不包含 OAuth token、Authorization header 或 client secret。

#### Scenario: List an authenticated server
- **WHEN** 客户端查询已授权 MCP Server 的状态和目录
- **THEN** 返回连接状态与目录信息，但不返回凭据内容

### Requirement: Generate clients from protocol source
修改 MCP 公共 Protocol 或 Server `HttpApi` 后 MUST 从 `packages/client` 重新生成客户端；生成文件 MUST NOT 被手工编辑。

#### Scenario: Protocol adds a lifecycle endpoint
- **WHEN** MCP 生命周期端点加入公共 HTTP API
- **THEN** 协议源、生成客户端和对应测试保持一致
