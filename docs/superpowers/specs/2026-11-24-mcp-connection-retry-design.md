# MCP 连接失败重试设计

状态：设计已确认

## 背景

当前 Nexum MCP Registry 已支持连接后的断线重连和一次 Session 过期恢复，但首次连接失败会直接进入 `failed`，需要 Client 再次调用 `connect`。同时，Local Runtime 尚未在启动阶段自动恢复 MCP 配置，因此 Client 页面无法观察一个稳定的初始化过程。

本变更参考 OpenCode 的 MCP Service/Connection 生命周期：连接所有权留在 Server 进程，调用方观察状态；连接操作使用单飞、取消和 generation 保护，旧连接不能覆盖新连接。

## 目标

- 首次连接失败时进入有限自动重试，而不是立即终态失败。
- 将首次失败、意外断线和 Session 过期恢复统一到 Registry 的重试状态机。
- 公开安全的 `retrying`、重试次数和下一次尝试时间，供 Server/Client 展示。
- 主动断开、移除、Runtime close、无效配置和 `needs_auth` 不触发自动重试。
- Runtime 启动时恢复已持久化配置，异步启动连接，不阻塞 Server ready。
- 保证工具 Registry 在 MCP 目录准备后再接受第一轮模型执行。

## 非目标

- 不把 MCP transport 或 OAuth 流程移动到浏览器。
- 不为每个 Client 页面创建独立重试器。
- 不无限重试，也不把 OAuth 用户交互错误当作网络重试。
- 不引入跨进程队列、数据库锁或集群 ownership。

## 设计

### Core Registry

`McpServerStatus` 增加 `retrying`。`McpServer` 增加可选的 `retryAttempt` 和 `nextRetryAt`，仅返回非敏感的整数/时间戳。Registry 内部保留一次重试计数和 timer，连接成功后清零。

所有自动重试使用同一个调度器：最多 3 次，延迟 `250ms → 1s → 3s`。首次 `connect` 失败、意外 `onClose` 和可恢复的 Session 错误都进入该调度器；`invalid_config`、`needs_auth`、`runtime_closed` 和主动 stop 直接结束。到达上限后保留 `failed` 与安全错误摘要，等待显式 `connect` 重新开启一轮。

每轮连接使用 generation 和 AbortController。disconnect/remove/close 会递增 generation、清理 timer、abort 正在进行的连接；旧 Promise 结束时只能关闭自身连接，不能发布 `connected` 或再排队重试。

### Runtime 启动

Local Runtime 由同一个进程创建 ConfigStore、CredentialStore、官方 SDK Connector、OAuth Manager 和 Registry。启动时读取配置，逐个注册到 Registry；禁用项保持 `disabled`，其它项立即进入异步 connect。Server 不等待所有远程连接完成即可 ready。

MCP 工具目录仍由 Application 的 `tools.ready` 控制：如果注入 MCP Registry，第一轮 Prompt 等待首次目录读取完成；后续 retrying/connected 状态变化通过现有 catalog listener 刷新工具定义。

### Server 与 Client

Server DTO 返回 `status`、`retryAttempt`、`nextRetryAt` 和脱敏错误，不返回 headers、access token、refresh token 或 client secret。能力声明继续反映 MCP 是否已注入。

Client 页面挂载后调用 `mcp.list()` 获取初始状态，随后以短轮询或状态事件刷新；页面不创建 SDK、不持有 retry timer。`needs_auth` 只展示授权入口；`failed` 展示“重试”操作，由 Server 开启新的重试轮次。

## 测试策略

- Core：首次失败后按退避恢复；连续失败达到上限；成功后重置计数；主动断开取消 timer；旧连接 Promise 不复活；OAuth/invalid config 不重试。
- Runtime：持久化配置在启动时恢复；无 MCP 配置路径不创建网络资源；关闭清理所有 timer 和连接。
- Server/Protocol/Client：DTO 和 API 反映 retrying 字段，不泄漏敏感信息；Client 页面初始化读取列表。
- 全量验证：受影响包测试、根 `bun run check`、OpenSpec strict validate。

