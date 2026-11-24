# Tasks

## 1. Core 契约与配置模型

- [x] 1.1 在 Schema/Core 中建立远程 MCP 配置、状态、目录、错误和生命周期端口契约，并保留现有 `McpPort` 的兼容入口；用 Core 类型测试验证状态转换、重复注册和安全错误摘要
- [x] 1.2 建立 MCP Registry 的单进程所有权和关闭契约，覆盖注册、禁用、移除、幂等 disconnect/close、并发 connect 合并和旧 operation 失效；从 `packages/nexum-core` 运行聚焦测试

## 2. 配置与凭据持久化

- [x] 2.1 实现 MCP 配置存储和 OAuth CredentialStore 的最小持久化接口，验证重启可恢复配置但不会回显 token/header
- [x] 2.2 实现配置边界校验、URL 规范化、Authorization 脱敏和凭据错误分类；补充安全序列化测试并通过受影响包的 typecheck

## 3. 官方 SDK 连接与 OAuth

- [x] 3.1 接入官方 `@modelcontextprotocol/client`，实现 Streamable HTTP 初始化、能力协商、工具/资源/prompt 目录发现、协议偏好和安全关闭；用真实测试 transport 验证初始化与调用
- [ ] 3.2 实现 OpenCode 对齐的 OAuth discovery、PKCE/state、loopback callback、redirect paste、凭据保存、提前刷新、一次 401 重试和 needs_auth；验证成功、取消、过期、刷新拒绝和 session expired 恢复
- [x] 3.3 将断线、session expired、catalog changed 接入单飞重连和去抖刷新，并验证 disconnect/close 与重连竞态不会复活旧连接

## 4. Application 工具桥接

- [ ] 4.1 将连接目录桥接到统一 Tool Registry，生成稳定 Server 命名空间、保留 input schema，并验证 catalog 变化的增删刷新
- [ ] 4.2 在 MCP 工具调用前接入 Permission，传递 session id 和取消信号，映射 `isError`、文本、结构化及二进制内容；测试权限拒绝和敏感信息不泄漏

## 5. Protocol、Server 与 Client 控制面

- [ ] 5.1 新增实验性 MCP list/add/remove/connect/disconnect、catalog 和 OAuth authorize/status/complete/cancel HTTP API，覆盖输入校验、幂等性、安全 DTO 与运行时状态
- [ ] 5.2 从 Protocol 源更新 Client API，并在 `packages/client` 运行 `bun run generate`；验证生成客户端可调用 MCP 生命周期端点且未手改生成文件
- [ ] 5.3 更新能力声明、API 文档和配置示例，说明远程 URL/OAuth 的生命周期与不暴露凭据规则；运行协议与 Server 聚焦测试

## 6. 集成与交付验证

- [ ] 6.1 将 MCP Registry 接入 embedded/local runtime、Server 和工具执行生命周期，验证无 MCP 配置启动路径不变、runtime.close 释放连接且重复 close 安全
- [ ] 6.2 运行受影响包的测试与 typecheck，再从仓库根目录运行 `bun run check`；按 review checklist 检查依赖方向、日志脱敏、错误边界和生成文件状态

## Workflow follow-up

- 所有实现任务完成后，使用 OpenSpec verify/validate 检查 specs 与实现一致，再按仓库流程提交、合并到 `dev-v0.0.1` 并清理任务 worktree。
- 归档变更前确认生成客户端、文档、测试和最终 `git diff origin/dev-v0.0.1` 均已审阅。
