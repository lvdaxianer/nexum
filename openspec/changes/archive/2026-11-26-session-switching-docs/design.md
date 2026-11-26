# Design

## 文档组织

- 在 `docs/examples/full-stack-chat.md` 中新增“查询和切换 Session”步骤，使用 Solid 的信号和列表渲染展示最小完整交互。
- 将原来的 Chat UI 和请求流步骤顺延，保持教程从创建数据到选择会话再到显示聊天界面的顺序。
- 在 `docs/capabilities/session.md` 增加“查询并切换会话”入口；模块 API 文档继续作为参数查询的权威入口。

## API 映射

- `client.experimental.nexum.session.list()` 查询后端当前 Runtime 的会话列表。
- `client.experimental.nexum.session.state({ sessionID })` 查询状态和恢复信息。
- `client.experimental.nexum.session.messages({ sessionID, limit })` 查询历史消息；自定义 UI 需要自行渲染。
- `<ChatSurface sessionID={selectedSessionID()} />` 在 Session ID 变化时自动重置并加载目标 Session 的状态、历史和 SSE。

## 边界

- 不让浏览器直接访问 SQLite，也不把持久化逻辑放到 UI。
- 不要求新手手动复制 ChatSurface 内部的历史加载、事件去重和重连逻辑。
- 仅在需要自定义聊天 UI 时，才展示 `state()`、`messages()` 和 `events()` 的手动组合。
