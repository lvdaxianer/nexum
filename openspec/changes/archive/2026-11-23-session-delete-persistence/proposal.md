# Proposal

## Why

Nexum 已经持久化模型配置、Session 元数据、消息历史、交互记录和事件历史，但页面目前无法删除不再需要的 Session。只删除列表项会留下孤儿历史数据，长期运行会扩大本地数据目录并造成用户对删除语义的误解。

## What Changes

- 增加 Session 的显式删除能力，删除 Session 元数据及其消息、交互和事件历史。
- 保留 Session 绑定的用户工作目录和全局模型配置。
- 运行中的 Session 拒绝删除，并返回稳定的冲突错误。
- 为删除接口补充 Nexum Client 方法、API 文档和前后端测试。
- 在页面会话操作中增加带确认、加载、失败恢复和成功切换行为的危险删除入口。

## Capabilities

### New Capabilities

- `nexum-session-deletion`: 管理 Session 删除请求、关联持久化数据清理、运行状态冲突和页面恢复行为。

### Modified Capabilities

- 无。

## Impact

- Core/Adapter：扩展 SessionStore、MessageStore、InteractionStore 和 EventHub 的清理端口及文件实现。
- Server：新增 `DELETE /api/nexum/session/:sessionID`，并编排关联数据清理。
- Client/Protocol：增加删除响应类型和 `session.delete` 调用。
- Surface：复用现有确认对话框实现删除入口与状态切换。
- Documentation：更新 `apis/nexum.md`。
- Persistence：仅删除 Nexum 自己的数据文件中的目标 Session，不操作用户工作目录或全局模型配置。
