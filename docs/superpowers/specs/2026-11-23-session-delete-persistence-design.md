# Session 删除与持久化设计

## 背景

Nexum 当前已经将模型配置、Session 元数据、消息历史、交互记录和事件历史分别持久化到本地 JSON 文件，并在服务重启后恢复。Session 列表支持创建、选择和重命名，但缺少删除能力；如果只删除 Session 元数据，会留下无法从 UI 访问的消息、交互和事件历史。

## 目标与边界

- 增加 `DELETE /api/nexum/session/:sessionID`。
- 删除 Session 元数据及该 Session 的消息、交互和事件历史。
- 保留用户工作目录及全局模型配置。
- 运行中的 Session 不允许删除，调用方必须先取消或等待运行结束。
- 删除请求使用稳定的 404/409/500 错误契约，并支持安全重试。
- UI 必须经过显式确认，确认期间防止重复提交；删除成功后切换到剩余 Session 或空态。

## 方案

在 Core 的 `NexumSessionService` 增加删除操作，并在各持久化端口提供按 Session 清理能力：SessionStore 删除元数据，MessageStore 删除 canonical history，InteractionStore 删除该 Session 的权限/Question 摘要，EventHub 删除回放历史。Server 先校验 Session 存在和状态，再按依赖数据优先、Session 元数据最后的顺序执行清理；每一步删除都设计为幂等，失败时保留 Session 元数据以便重试，工作目录不参与删除。

客户端增加对应的 `session.delete` 方法。前端在现有“会话操作”抽屉中复用 `ConfirmDialog`，使用红色危险操作样式；确认请求成功后中止事件流，清空当前会话的页面状态和 `sessionStorage`，并从稳定 ID 对应的列表项中移除已删除 Session。

## 错误与并发

- 不存在的 Session 返回 `404 NEXUM_SESSION_NOT_FOUND`。
- 状态为 `running` 的 Session 返回 `409 NEXUM_SESSION_RUN_CONFLICT`，不修改任何持久化数据。
- 重复删除已不存在的 ID 返回同一 404，不产生新的数据。
- 删除仅允许在当前进程的 Session 状态不是 `running` 时执行，避免与 Coding Loop 写入同一 Session 的消息和事件历史并发。
- 多文件 JSON Store 没有跨文件事务；清理顺序保证 Session 记录在最后删除，失败后可用同一 ID 重试。实现不删除工作目录，不记录凭据或敏感内容到错误和日志。

## 测试策略

- Core/Adapter：测试内存和文件 Store 的按 Session 删除、无关 Session 保留、重启后删除结果不恢复。
- Server：测试成功删除、运行中冲突、未知 Session、重复删除、关联消息/交互/事件历史清理和工作目录保留。
- Client：测试 DELETE 方法使用正确路径、HTTP 方法和返回 Envelope。
- UI：测试必须先确认；确认按钮 pending 时不可重复触发；成功删除当前 Session 后列表、事件流和空态/下一个 Session 一致；失败时保留当前状态并显示可重试提示。
- 文档：在 `apis/nexum.md` 增加端点完整契约和 curl 示例。
