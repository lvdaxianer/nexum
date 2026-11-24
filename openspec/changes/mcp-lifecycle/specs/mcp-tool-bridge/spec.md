## Purpose

将已发现的 MCP 工具安全地接入 Nexum 统一工具注册与调用链，保持 OpenCode 的命名、权限、会话和动态刷新语义。

## ADDED Requirements

### Requirement: Register discovered MCP tools
运行时 MUST 将已连接 MCP Server 的工具注册到统一 Tool Registry，工具名 MUST 使用稳定的 Server 命名空间，输入 schema MUST 保留并可供模型调用。

#### Scenario: Connected server tools become available
- **WHEN** MCP Server 完成初始化并返回工具目录
- **THEN** 统一 Tool Registry 暴露带 Server 命名空间的工具，并保留 MCP 输入 schema

### Requirement: Enforce permission and session context
MCP 工具调用 MUST 经过统一 Permission 检查，并 MUST 将当前 session 标识传递到调用边界。

#### Scenario: Permission denies an MCP tool call
- **WHEN** 当前 session 对目标 MCP 工具没有调用权限
- **THEN** 调用在发送到 MCP Server 前失败，并返回稳定的权限错误

### Requirement: Map MCP tool results safely
工具桥接 MUST 正确映射 `isError`、文本、结构化数据和二进制内容；错误和日志 MUST 不泄露 OAuth token、Authorization header 或其他凭据。

#### Scenario: MCP returns mixed content
- **WHEN** MCP 工具返回文本、结构化数据或二进制内容的组合
- **THEN** 统一工具结果保留可消费内容，并将 MCP 错误标记映射为调用失败语义

### Requirement: Refresh tools after catalog changes
MCP 工具目录变化 MUST 触发统一 Tool Registry 刷新；刷新 MUST 具备去抖和并发保护，避免重复注册或使用过期目录。

#### Scenario: Server reports a tool-list change
- **WHEN** 已连接 Server 发出工具目录变化事件
- **THEN** 工具桥接在去抖后刷新该 Server 的工具，并移除已不存在的工具
