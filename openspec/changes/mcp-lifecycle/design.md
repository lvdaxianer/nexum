# Design

## Context

当前 Nexum 的 MCP 只是一组由调用方注入的端口和传输适配器：没有持久化注册表、初始化握手、目录缓存、OAuth、重连、工具桥接或运行时关闭语义。具体需求见 `proposal.md` 与各 capability spec。

本设计以 OpenCode 当前 MCP 实现为行为参考：`core/mcp/index.ts` 负责服务注册、状态和生命周期，`mcp/connection.ts` 负责连接与恢复，`mcp/client.ts` 负责 MCP SDK 初始化及传输，`mcp/oauth.ts` 负责 OAuth，`tool/mcp.ts` 负责工具注册和权限边界。Nexum 的 Schema、Core、Protocol、Server、Client 依赖方向必须保持现有约束。

## Goals / Non-Goals

**Goals:**

- 建立进程内 MCP Registry，支持远程 URL 注册、状态观察、初始化、目录发现、连接、断开、移除和运行时关闭。
- 使用官方 MCP Client SDK 完成 `initialize`、能力协商、Streamable HTTP 连接、目录变化通知和调用结果映射。
- 对齐 OpenCode 的 OAuth 双模式：优先 loopback 浏览器回调，无法回调时支持 redirect URL 粘贴；支持 PKCE、state、凭据持久化、提前刷新和 401 恢复。
- 将 MCP 工具注册到 Nexum 统一工具链，经过 Permission 检查并携带 session 上下文。
- 提供实验性 Server/Client 控制 API，并由 Protocol 源文件生成客户端类型和方法。
- 保持没有 MCP 配置时的启动行为不变，所有关闭和重复控制操作保持幂等。

**Non-Goals:**

- 第一阶段不实现 OpenCode 的连接池、多租户放置、客户端托管 MCP WebSocket、资源订阅事件游标或完整 prompt UI。
- 不自定义 MCP 协议实现，不复制 SDK 的 JSON-RPC、HTTP 会话或 OAuth 协议逻辑。
- 不把 OAuth token 放入 MCP 配置、公开 API、持久化事件、工具结果或普通日志。

## Decisions

### 1. 用 Core 状态机包裹官方 SDK，而不是扩展现有 raw RPC adapter

Core 定义稳定的 MCP 配置、状态、目录和控制端口；Integrations 将官方 `@modelcontextprotocol/client` 的 Client、Transport、OAuth provider 适配到这些端口；Application 持有 Registry 并协调运行时。

每个 Server 具有唯一稳定 id 和显式状态：`disabled`、`pending`、`connected`、`failed`、`needs_auth`。状态条目只保存安全错误摘要和当前目录快照，连接句柄、刷新器、取消控制器等运行时对象留在内存中。

选择这种边界是因为 OpenCode 的 `Mcp.Service` 也把“可观察的 Server 状态”和“连接实现”分开；Nexum 可以复用现有端口，而不会让 Core 依赖 Bun、HTTP 或 SDK。替代方案是继续暴露 `McpRpcTransport`，但那无法可靠表达初始化、重连、OAuth 和关闭。

### 2. 远程 MCP 只接受明确的配置模型，URL 和 header 在边界校验

Schema 增加本地与远程配置的判别联合类型：远程配置包含 URL、可选 headers、disabled、timeout、OAuth 配置和协议偏好；注册时规范化 URL、拒绝空名称和不支持的协议，并对同一 registry 内的重复 id/name 返回冲突错误。

Bearer header 只在 transport 和 OAuth provider 内部使用。状态、事件、API DTO 和日志使用脱敏后的 Server 配置视图。替代方案是把 header 作为任意字典贯穿所有层，但会扩大泄密面，也不符合 OpenCode 将凭据交给 Credential/transport 的做法。

### 3. 连接流程采用显式阶段和单飞恢复

`connect` 的主路径为：读取配置 → 创建 OAuth provider（如需要）→ 创建 Streamable HTTP transport → `initialize` → 能力协商 → 拉取 tools/resources/prompts 目录 → 发布 `connected` → 触发工具刷新。初始化中为 `pending`；认证缺失或需要用户交互为 `needs_auth`；不可恢复错误为 `failed`。

连接对象为每个 Server 保存一个 generation/operation token。断开、移除或关闭会先取消当前操作；同一 Server 的并发 connect/reconnect 合并为一次，旧连接的 close 或 list-changed 回调不能覆盖新 generation。短暂网络错误和 session expired 进入受限重连，采用有上限的指数退避；不会无限阻塞 HTTP handler，也不会在 Server 端等待插件或 MCP 加载完成。

该模型对应 OpenCode 的 `Connection.start/stop/recovering` 和带锁的恢复逻辑，同时遵循 Nexum 现有“启动不阻塞请求、读取当前已加载状态”的可靠性约束。

### 4. OAuth 使用 provider 接口，并优先回调、回退粘贴

OAuth provider 负责 metadata discovery、resource URL 校验、authorization server discovery、PKCE、state、loopback callback、redirect paste、token exchange、refresh 和 invalidation。授权尝试具有唯一 id、过期时间、取消信号和最终状态，生命周期结束后清理 listener/临时 server。

默认授权路径启动本机 loopback HTTP listener 并返回 authorization URL；若浏览器无法回调，API/CLI 可提交 redirect URL 完成同一尝试。state、PKCE verifier 和 resource 绑定只保存在内存授权上下文；access/refresh token 通过受保护的 CredentialStore 保存，普通 MCP 配置只保存引用和非敏感 OAuth 参数。

调用收到 401 时只允许一次“刷新后重试”；刷新被永久拒绝时删除对应凭据并将 Server 标为 `needs_auth`。替代方案是只支持手工 token 或只支持浏览器回调，都会丢失 OpenCode 的远程 MCP 可用性和无浏览器环境兼容性。

### 5. 工具桥接在 Application 层，Permission 是调用前边界

Application 根据 Registry 的 catalog 生成命名空间工具，例如 `<server>_<tool>`，保留 MCP input schema。工具执行器只接收 typed session context，通过统一 Permission 检查后调用 Registry；Registry 再把 session id、arguments 和取消信号交给 Connection。

结果映射保留文本、结构化内容、图片/资源等可消费内容，`isError` 变成统一工具失败语义。MCP catalog change 事件只触发按 Server 去抖的异步刷新，刷新期间保留上一份可用目录；刷新完成后原子替换该 Server 的工具集合。工具桥接不直接读取 OAuth 或 header，也不在错误中拼接原始 transport 信息。

### 6. 控制 API 先实验性落地，Protocol 是唯一来源

新增 MCP list/add/remove/connect/disconnect、catalog 查询及 OAuth authorize/status/complete/cancel 的实验性端点。API handler 只调用 Application MCP port，不直接操作 SDK。响应使用安全 DTO，状态和错误码稳定，connect 返回当前状态而非等待无限长的握手。

Protocol 和 Server `HttpApi` 变更完成后，必须在 `packages/client` 执行 `bun run generate`；生成客户端不得手工修改。Client 对 MCP 控制操作采用与现有 API 相同的请求/错误处理风格。客户端托管 MCP WebSocket 暂缓，不为了复刻 OpenCode 的全部 client-hosted 能力而改变当前 Client/Core 依赖边界。

### 7. Runtime 负责所有权和关闭顺序

`createEmbeddedRuntime`/`createLocalRuntime` 创建或接收 MCP Registry，并将它作为唯一生命周期所有者注入工具桥接和 Server API。`runtime.close()` 先停止接受新的 MCP 控制操作，再取消授权与连接操作，断开 transports，最后释放 Registry；重复 close 必须安全。没有 MCP 配置时不创建网络资源，能力列表反映实际注入/启用状态。

## Risks / Trade-offs

- [Risk] 远程 Server 启动慢或不可达会拖慢首次可用时间 → [Mitigation] connect 采用异步 pending 状态，API 立即返回，调用方通过状态查询或更新事件观察结果。
- [Risk] OAuth provider discovery 或回调服务器留下监听器 → [Mitigation] 每个授权尝试有过期/取消清理，所有 listener 在成功、失败和关闭路径统一释放。
- [Risk] reconnect 与 disconnect 竞态导致旧连接重新发布目录 → [Mitigation] 使用 per-server operation token/generation 和单飞锁，旧回调只允许释放自身资源。
- [Risk] MCP 返回异常结构或超大结果影响工具链 → [Mitigation] 在 SDK 边界做 schema/大小限制和安全结果映射，保留明确的 provider error summary。
- [Risk] 配置中仍可能出现明文 header → [Mitigation] DTO/日志统一脱敏，CredentialStore 保存 OAuth secret；在 schema 边界拒绝把 Authorization 值回显到错误和状态。
- [Risk] 第一阶段的 file-backed registry 与未来多进程部署不一致 → [Mitigation] 将持久化和运行时 Registry 通过接口隔离，明确本阶段仅保证单进程所有权，后续再引入池或集群 fencing。

## Migration Plan

1. 先加入 Core/Schema 契约和无 MCP 默认路径测试，保持现有 raw adapter 兼容适配。
2. 加入受保护凭据/配置存储和官方 SDK transport，再接入 Application Registry、OAuth 和工具桥接。
3. 增加实验性 Protocol/Server/Client API，运行客户端生成和协议测试。
4. 先在关闭默认的 feature flag 或开发环境启用远程 MCP，验证连接、OAuth、恢复和关闭路径后再扩大默认范围。
5. 回滚时关闭 flag 并停止新 API 调用；已保存的 MCP 配置保留，删除/迁移凭据只通过显式 credential 管理操作完成。

## Open Questions

- 未来引入多进程/集群时，Registry 的持久化存储和连接 ownership 需要与当前单进程契约重新对齐；不影响本阶段接口和任务拆分。
