# Proposal

## Why

当前 `@nexum/surfaces` 将 Session 管理、模型配置、Skill 管理和聊天运行状态集中在一个页面入口中，聊天能力无法独立嵌入业务页面或弹框。现在需要把聊天体验抽成一个遵守既有 Nexum Protocol 的完整 Surface，使宿主只提供 `sessionID`，即可复用历史恢复、实时事件、权限、Question、运行控制和 `@skill` 能力。

## What Changes

- 新增可复用的 `ChatSurface` Solid 组件，承载一个 Session 的完整聊天体验。
- 新增 `<nexum-chat>` Web Component，使聊天 UI 可以嵌入独立页面、业务页面、弹框或 Drawer。
- 增加稳定的聊天协议适配器边界，统一封装历史消息、Session 状态、SSE 事件、Prompt、Continue、Cancel、Permission、Question 和 Skill 查询。
- 将现有页面中的聊天区域迁移到 `ChatSurface`，保留页面对 Session 生命周期、模型配置和 Skill 注册管理的控制。
- 支持 `@skill` 补全、提交、权限等待和 Skill 激活/失败状态展示；不把 Skill 注册、刷新、校验和删除放入聊天组件。
- 保留历史分页、事件游标恢复、断线重连、运行状态反馈、重复提交保护和消息滚动行为。

## Capabilities

### New Capabilities

- `chat-surface`: 提供可嵌入的完整 Session 聊天 Surface、Web Component 封装和宿主集成契约。

### Modified Capabilities

无。ChatSurface 复用这些既有能力，不改变它们的协议要求。

## Impact

- 受影响代码：`packages/nexum-surfaces`，以及新增的 ChatSurface 包和相关测试。
- 复用既有 `@nexum/client` 与 `@nexum/protocol`，不新增或修改协议端点。
- 宿主依赖从“直接管理聊天内部状态”变为传入 `sessionID` 和连接配置。
- 需要增加 Web Component 构建入口、CSS Variables 定制入口和 UI smoke 验证。
- 不引入文件上传能力；附件等能力必须在 Protocol 具备正式契约后再加入。
