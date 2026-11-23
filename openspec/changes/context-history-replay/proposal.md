# Proposal

## Why

Nexum 当前页面主要通过 SSE 事件投影运行过程，切换或刷新 Session 后无法从服务端恢复完整的 canonical 对话历史。上下文压缩摘要虽然已经持久化到 `MessageStore`，但页面没有读取入口，用户无法通过滚动查看之前的对话、工具结果和压缩摘要。

## What Changes

- 新增按 Session 分页读取 canonical 消息历史的只读接口。
- 将用户消息、Assistant 消息、reasoning、工具调用、工具结果和上下文压缩摘要返回给页面。
- 页面选择或恢复 Session 时加载最近消息，并在滚动到顶部时加载更早消息。
- 保留 SSE 事件流作为实时增量，避免历史消息加载与实时运行状态混淆。
- 普通对话视图不返回默认角色提示词、Skill 原文、项目上下文原文和模型凭据。

## Capabilities

### New Capabilities

- `headless-session-history`: 提供 Session canonical 消息历史的分页读取、恢复和滚动展示能力。

### Modified Capabilities

- `headless-session-control`: Session 恢复不仅重新连接事件流，还 SHALL 恢复已持久化的对话消息。

## Impact

- 修改 `packages/nexum-protocol`、`packages/nexum-client` 和 `packages/nexum-server` 的公开读取契约。
- 修改 `packages/nexum-surfaces` 的 Session 选择、对话渲染和滚动交互。
- 复用 `MessageStore`，不改变现有 `messages.json` 的持久化格式。
- 事件 `events.json` 和 SSE 行为保持独立，不扩大事件历史上限。
