# Spec Delta

## Purpose

为 Nexum 提供可恢复、可观察的远程 MCP Server 生命周期，使宿主能够通过远程地址注册 MCP，并在运行时完成连接、目录发现、失败恢复和安全关闭。

## ADDED Requirements

### Requirement: 宿主可以注册远程 MCP Server

系统 SHALL 接受唯一 Server 名称和远程 URL，并持久化 URL、可选 Headers、协议模式和禁用配置；注册请求必须校验名称、URL 和配置字段。

#### Scenario: 注册合法远程 Server

- **WHEN** 宿主提交唯一名称与合法远程 URL
- **THEN** 系统持久化该配置，并为该 Server 创建可查询的生命周期条目

#### Scenario: 注册重复名称

- **WHEN** 宿主提交已存在名称且未明确执行替换
- **THEN** 系统拒绝请求并返回稳定的冲突错误，原配置和连接不变

### Requirement: MCP Server SHALL expose explicit connection status

系统 SHALL 为每个已注册 Server 暴露 `disabled`、`pending`、`connected`、`failed` 和 `needs_auth` 状态，并返回安全的失败摘要。

#### Scenario: 初次连接进行中

- **WHEN** 已启用 Server 开始连接或重连
- **THEN** 其状态为 `pending`，调用方可以读取该状态而不需要等待整个 Runtime 启动

#### Scenario: 远程连接失败

- **WHEN** URL 无效、握手失败或远程服务不可达
- **THEN** 状态变为 `failed`，错误响应不得包含 Token、Headers、Authorization Code 或完整上游响应

#### Scenario: Server 需要授权

- **WHEN** 远程 Server 拒绝匿名请求且需要用户授权
- **THEN** 状态变为 `needs_auth`，调用方可以单独启动授权流程

### Requirement: MCP connection SHALL initialize and discover catalogs

系统 SHALL 在 Server 进入 `connected` 前完成 MCP initialize 握手、协议协商和工具目录发现，并按需获取 resources、resource templates 和 prompts。

#### Scenario: 初始化成功

- **WHEN** 远程 Server 完成协议握手且工具目录可读取
- **THEN** Server 状态变为 `connected`，工具目录与 Server 名称关联

#### Scenario: 目录读取失败

- **WHEN** 握手成功但工具目录读取失败
- **THEN** 系统不得将 Server 报告为正常可用，且保留可重试的失败状态

### Requirement: MCP connection SHALL recover from transient failures

系统 SHALL 对可恢复的网络失败、远程 Session 失效和连接关闭执行有界重试或重连，并避免并发重连覆盖最新连接。

#### Scenario: HTTP Session 失效

- **WHEN** 已连接的远程 Server 返回表示 Session 已失效的响应
- **THEN** 系统建立新连接并最多重试当前操作一次，失败后返回稳定错误

#### Scenario: 连接意外关闭

- **WHEN** Transport 在 Server 未被主动断开时关闭
- **THEN** 系统更新状态并在有界退避后尝试恢复，主动断开的 Server 不得被自动重连

### Requirement: MCP lifecycle SHALL release owned resources

系统 SHALL 在 disconnect、remove 和 Runtime close 时关闭 MCP Client、HTTP Session、stdio/Transport 和 OAuth 回调资源，并保证关闭操作幂等。

#### Scenario: Runtime 优雅关闭

- **WHEN** 宿主调用 Runtime close
- **THEN** MCP 不再接受新的调用，并在退出前释放所有连接、回调监听器和后台重连任务

#### Scenario: 重复关闭

- **WHEN** 宿主重复调用 disconnect 或 close
- **THEN** 系统返回成功或稳定的已关闭结果，不重复释放资源，也不产生未处理异常

