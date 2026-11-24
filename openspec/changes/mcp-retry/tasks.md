# Tasks

- [x] 1.1 扩展 Core MCP 状态与安全 DTO，统一首次失败、断线和 Session 恢复的有限重试调度
- [x] 1.2 用 Core 测试覆盖成功恢复、重试上限、主动断开取消、OAuth/配置错误不重试和旧连接竞态
- [ ] 2.1 将持久化 MCP 配置恢复接入 Local Runtime，启动时异步注册并连接，关闭时清理所有连接与 timer
- [ ] 2.2 验证无 MCP 配置启动路径不变，并确保工具 Registry 的初始 ready 与 MCP 状态一致
- [ ] 3.1 更新 Protocol、Server、Client 的 retrying 状态 DTO 与控制 API
- [ ] 3.2 在 Client 页面启动时读取 MCP 列表并展示 pending/retrying/connected/needs_auth/failed 状态
- [ ] 4.1 更新 MCP 生命周期文档、API 文档和 OpenSpec；运行受影响包测试、typecheck 与根 `bun run check`
