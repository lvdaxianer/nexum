# Proposal

## Why

当前完整 Agent 教程只展示了创建一个 Session，初学者不知道如何查询已有 Session，也不知道点击不同会话后如何让聊天内容切换并恢复。需要补充一个与现有公开 API 一一对应的前端交互案例。

## What Changes

- 在完整 Agent 教程中增加 Session 列表查询和选中状态管理。
- 展示点击不同 Session 后，把 `selectedSessionID` 传给 `ChatSurface` 的方式。
- 说明 ChatSurface 会自动加载状态、历史并重新订阅 SSE；同时给出自定义 UI 手动调用 `state()` 和 `messages()` 的方式。
- 在教程、Session 能力文档、Client 模块文档和 ChatSurface 模块文档之间增加互相跳转入口。

## Capabilities

### New Capabilities

无。本次只补充使用文档，不新增运行时行为。

### Modified Capabilities

无。本次不修改已有协议或 API 要求。

## Impact

- 影响 README 教程和 `docs/` 下的使用文档。
- 不修改运行时代码、协议、依赖或发布包内容。
