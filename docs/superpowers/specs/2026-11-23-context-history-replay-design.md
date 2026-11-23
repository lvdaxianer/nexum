# Session 历史对话恢复设计

## 背景

Nexum 已经把 canonical `ModelMessage[]` 按 Session 持久化到 `MessageStore`，但控制台目前只从 SSE 事件构建有界的临时 `ChatItem`。因此页面刷新或切换 Session 后看不到持久化对话，也无法通过滚动查看被压缩摘要和更早工具交互。

## 方案

新增实验性分页读取接口 `GET /api/experimental/nexum/session/:sessionID/messages`。接口读取 `MessageStore`，以 `before` 索引游标和 `limit` 限制返回窗口，并在响应边界递归脱敏。客户端增加对应的类型和方法，同时扩展事件订阅支持 `afterSequence`，让历史加载与实时 SSE 不重复。

页面选择 Session 时先加载最新消息页，再以 `state.lastSequence` 建立事件订阅。向上滚动触发上一页加载，按加载前后的 `scrollHeight` 修正 `scrollTop`，保持用户当前阅读位置。对话与事件仍是两个独立视图：消息历史用于恢复对话，SSE 用于实时状态和事件时间线。

## 边界

普通对话只展示 canonical 消息：用户消息、Assistant 文本/reasoning、工具调用、工具结果和压缩摘要。默认角色提示词、Skill 原文、项目上下文原文、工具定义和模型凭据不作为普通历史返回。完整模型 prompt 快照不在本次范围内。

## 验证

- Server 测试覆盖分页、游标、错误、消息类型和脱敏。
- Event 测试覆盖 sequence 游标回放。
- Surfaces Smoke 测试覆盖刷新恢复、向上分页、加载失败和实时合并。
- 运行 OpenSpec 严格校验、受影响包测试、全量 `bun run check` 和浏览器验证。
