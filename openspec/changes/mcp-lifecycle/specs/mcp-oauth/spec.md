# Spec Delta

## Purpose

为需要授权的远程 MCP Server 提供与 OpenCode 对齐的 OAuth 生命周期，使用户能够安全完成登录、重启后恢复凭据、在 Token 过期时刷新，并在授权失效时重新登录。

## ADDED Requirements

### Requirement: 系统 SHALL discover the MCP OAuth authorization server

系统 SHALL 根据远程 Server 的认证挑战、受保护资源元数据或显式配置发现 OAuth Authorization Server，并校验资源标识与配置的 MCP URL 匹配。

#### Scenario: 通过认证挑战发现

- **WHEN** 远程 MCP 返回包含资源元数据或作用域的认证挑战
- **THEN** 系统使用该信息发现授权服务器，并继续生成授权请求

#### Scenario: 元数据与 MCP URL 不匹配

- **WHEN** 发现的资源元数据不覆盖已配置的 MCP URL
- **THEN** 系统拒绝授权并返回稳定的配置错误，不保存 Token

### Requirement: OAuth authorization SHALL use PKCE and state validation

系统 SHALL 使用 PKCE、不可预测的 state 和受限的 loopback callback 完成授权码流程，并校验回调中的 state、code 和错误参数。

#### Scenario: 浏览器回调成功

- **WHEN** 用户在浏览器完成授权并回调本机地址
- **THEN** 系统校验 state 后交换 authorization code，保存凭据并使 MCP Server 可以重连

#### Scenario: 回调 state 不匹配

- **WHEN** 回调携带的 state 与当前授权尝试不一致
- **THEN** 系统拒绝该回调，授权尝试失败，且不得创建或覆盖凭据

### Requirement: OAuth authorization SHALL support redirect URL fallback

系统 SHALL 在浏览器无法访问本机回调时接受用户粘贴的 redirect URL，并使用与浏览器回调相同的 state、code、issuer 和错误校验。

#### Scenario: 用户粘贴合法 redirect URL

- **WHEN** 用户提交包含合法 code 和匹配 state 的 redirect URL
- **THEN** 系统完成同一授权码交换并返回授权成功状态

#### Scenario: 用户粘贴非法 redirect URL

- **WHEN** redirect URL 缺少 code、state 不匹配或包含授权错误
- **THEN** 系统拒绝输入且当前授权尝试保持可诊断的失败状态

### Requirement: OAuth credentials SHALL be isolated from MCP configuration

系统 SHALL 将 Access Token、Refresh Token、Client Information、Discovery 和 PKCE 状态保存在凭据存储中，不得写入普通 MCP 配置、公开 API 响应、事件或日志。

#### Scenario: 重启后恢复授权

- **WHEN** Runtime 使用已保存的 MCP 配置和有效 OAuth 凭据重新启动
- **THEN** 系统读取凭据并尝试无交互连接，不要求用户再次登录

#### Scenario: 授权凭据不存在

- **WHEN** MCP Server 需要 OAuth 但没有可用凭据
- **THEN** Server 状态为 `needs_auth`，系统提供可启动的授权尝试

### Requirement: OAuth tokens SHALL refresh and invalidate safely

系统 SHALL 在 Token 临近过期时有界刷新，并在远程 Server 返回未授权时最多使用当前凭据执行一次安全刷新；刷新拒绝时必须使凭据失效并转为 `needs_auth`。

#### Scenario: Token 临近过期

- **WHEN** 连接请求发现 Access Token 在刷新提前窗口内过期
- **THEN** 系统使用 Refresh Token 刷新并持久化新凭据，再发送 MCP 请求

#### Scenario: Refresh Token 被拒绝

- **WHEN** Authorization Server 返回 invalid_grant、invalid_client 或等价的永久拒绝
- **THEN** 系统删除或停用该凭据，Server 状态变为 `needs_auth`，不得无限重试

### Requirement: OAuth authorization attempts SHALL be bounded and cancellable

系统 SHALL 为每次授权尝试提供唯一 ID、过期时间、状态查询和取消能力，并在完成、失败、取消或超时后释放 callback 监听器和临时 PKCE 状态。

#### Scenario: 取消授权

- **WHEN** 用户取消仍在等待浏览器回调的授权尝试
- **THEN** 系统关闭回调资源、清理临时状态，并且不修改现有有效凭据

