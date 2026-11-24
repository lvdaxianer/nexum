# Design

## Context

当前事件流已经提供 `session.completed`、`session.failed`、`session.cancelled` 和 `run.settled`。ChatSurface 顶部状态会消费这些事件，但 `projectChatEvent` 只追加终态卡片，没有结束同一 `runID` 下已有的 `streaming`、`running` 项。宿主 Session 列表只在初始化和手动刷新时请求列表，因此不会随着事件流变化。

## Goals / Non-Goals

**Goals:**

- 一个 run 进入终态后，时间线内不再残留该 run 的进行中状态。
- ChatSurface 宿主可以收到稳定的 Session 终态通知。
- 宿主按 Session ID 更新单个列表项，不重新请求或替换整个列表。
- 保持现有事件协议、历史消息和取消/继续行为不变。

**Non-Goals:**

- 不改变 Core 的事件发布顺序或 Session 持久化流程。
- 不增加轮询、定时器或新的 HTTP/SSE 端点。
- 不重构 ChatSurface 的完整状态管理。

## Decisions

### 1. 以 `run.settled` 作为统一投影收敛点

`run.settled` 对完成、失败和取消都有明确结果，适合作为同一 run 的最终投影边界。`session.*` 事件继续负责展示语义终态卡片；重复收到两类终态事件时必须保持幂等。

终态收敛只修改当前 `runID` 的 transient 项：思考项和 Agent 输出项变为结果状态，模型尝试/重试执行项变为结果状态；已经是失败或完成的工具、权限和问题项不被覆盖。

### 2. 用可选回调连接 ChatSurface 与宿主

在 `ChatSurfaceProps` 增加 `onSessionStatusChange`，参数为当前 Session ID 和 `NexumSessionStatus`。回调只在终态事件投影时触发，宿主用 Session ID 做浅层合并。这样保留 ChatSurface 的受控 Session 边界，不让组件直接管理宿主的 Session 集合。

### 3. 保持宿主列表引用稳定

宿主只对匹配 ID 的对象创建新引用，其他 Session 保持原引用；不通过完整 `session.list()` 刷新来解决实时状态。手动刷新仍可用于恢复断线或跨页面变化。

## Error Handling

- 缺少或未知终态结果时不改变时间线，也不触发宿主回调。
- 宿主回调只更新本地列表，不影响事件流；回调异常不得阻断事件消费。
- 重复终态事件只能重复设置相同终态，不得产生第二个进行中项。

## Testing

- ChatSurface 投影测试覆盖 completed、failed、cancelled 三种终态，并断言同一 run 的进行中卡片已收敛。
- 宿主测试覆盖终态事件后匹配 Session 的状态更新，以及其他列表项保持不变。
- 运行受影响包测试、类型检查和根目录 `bun run check`。
