# Design

## Context

详见 `proposal.md` 的问题背景。当前 `NexumCodingLoop` 已有 `AbortSignal`、工具超时等待和 `run.settled`，但工具超时只会拒绝外层 Promise，不会保证底层进程被终止；本地 Host 读取 stdout/stderr 到 EOF，也可能被后台子进程无限保持。页面已有 `tool.request`、`tool.result` 和 `assistant.thinking` 投影，但思考心跳会持续覆盖没有结果的工具调用。

## Goals / Non-Goals

**Goals:**

- 让本地 Shell 在默认截止时间内完成、失败、超时或取消，并保证调用 Promise 最终结算。
- 取消时终止 Shell 进程树；优雅终止失败时使用硬清理兜底，并限制清理等待时间。
- 让工具超时和取消通过现有事件序列进入稳定的运行终态。
- 让页面将工具活动优先于思考心跳显示，并保留可继续或重试的终态。
- 保持现有 `ToolPort`、HTTP 路径和 Session 历史兼容。

**Non-Goals:**

- 不实现跨机器的 Session 执行调度或 exactly-once 工具执行。
- 不把模型内部不可公开的隐藏思维链暴露给页面；只修复运行状态和模型主动提供的 reasoning 增量。
- 不为所有外部 MCP 工具强行增加统一的进程终止协议；本次只保证 Core 的等待边界，并优先修复本地 Shell。

## Decisions

### 1. 在本地 Host 建立 Shell 生命周期边界

`runShell` 负责默认/可配置的总截止时间、AbortSignal 监听、stdout/stderr 读取和最终退出码。截止或取消时先发 SIGTERM，等待短暂清理窗口后发 SIGKILL；在 POSIX 环境优先按独立进程组清理，直接子进程清理作为回退。这样后台 `git`、网络客户端或管道子进程不会继续持有输出管道。

备选方案是只在 Core 使用 `waitForAbortable`，但它无法停止已经启动的进程，容易留下残留进程并造成资源泄漏，因此不采用。

### 2. 使用现有工具事件承载终态元数据

Core 继续发布 `tool.request` 和 `tool.result`，在失败结果中携带稳定的 `errorCode`/`status` 元数据，并随后发布一次 `session.failed` 或 `session.cancelled` 与 `run.settled`。不新增独立事件类型，避免协议事件枚举、客户端生成物和重放兼容面扩大。

工具执行超时必须先形成一个可投影的失败结果，再让外层运行失败；取消则形成 cancelled 结果并走现有取消分支。工具结果发布失败时仍由现有终态保护逻辑保证 Session 不永久保持 running。

### 3. 默认值只在未显式禁用时生效

Core 对未提供的工具超时使用安全默认值，测试和受控部署可传入更短值；保留显式 `0` 表示关闭边界的兼容语义。应用层默认使用同一配置，并把 Shell 的清理截止时间设置为更短的内部值，避免超时处理再次卡住。

备选方案是所有调用方必须显式传入超时，这会让新的 Host 或测试组合重新回到无限等待风险，因此不采用。

### 4. 思考心跳只作为空闲提示

ChatSurface 在已存在同一 run 的未完成工具项时忽略或不显示后续 `assistant.thinking`，工具结果或终态到达后再收敛该项。这样不改变心跳的传输兼容性，也不会把心跳当作执行进展。

### 5. 以真实挂起场景驱动测试

测试使用不会自行退出且能产生后台子进程的 Shell 夹具，验证超时、取消、stdout/stderr 不关闭、进程清理和事件顺序；Core 测试验证工具超时/取消后只产生一次 settled；ChatSurface 测试验证工具活动优先级和重连后的终态幂等。测试不得依赖网络或真实远程仓库。

## Risks / Trade-offs

- [进程组能力依赖平台] → 在 POSIX 上使用独立进程组，在不支持时至少清理直接子进程，并把清理失败写入稳定错误摘要。
- [强制终止可能截断输出] → 先保留已读取的 stdout/stderr，再在结果中标记 timeout/cancelled；不宣称命令已完成。
- [默认超时可能中断长任务] → 默认值取足够宽松的分钟级窗口，同时允许运行时配置覆盖；超时后提供 continue/retry。
- [工具结果事件在异常路径中丢失] → 将异常转换成一次失败结果的逻辑放在工具调用边界，并用生命周期测试锁定事件顺序。
- [心跳与工具事件存在竞态] → UI 按事件序列和 run/toolCallID 投影，测试在交错到达时验证工具项不会被思考项覆盖。

## Migration Plan

1. 先落地本变更的 Core、Host、Surface 实现和回归测试；未改变 HTTP 路径或历史数据格式。
2. 在本地以前端/后端启动方式运行挂起 Shell 夹具，确认超时、取消、事件重连和 Session continue。
3. 若默认值需要调整，只修改运行时配置，不迁移既有 Session 数据。
4. 回滚时恢复旧代码即可；已写入的 `tool.result` 失败元数据对旧客户端是可忽略的普通事件，Session 终态仍保持兼容。

## Open Questions

无。默认时限、清理窗口和事件元数据都不改变规格定义，后续可按真实运行指标调参。
