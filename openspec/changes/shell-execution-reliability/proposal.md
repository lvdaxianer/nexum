# Proposal

## Why

Shell 工具可能因网络命令、后台子进程或 stdout/stderr 未关闭而无限等待；当前页面会继续显示“模型正在思考”，用户无法区分模型等待、工具执行和工具卡死。现在需要把工具执行做成有界、可取消、可恢复的运行时行为，避免一次卡住阻塞整个 Session。

## What Changes

- 为本地 Shell 工具提供默认且可配置的执行截止时间。
- 在取消或超时时终止整个 Shell 进程树，并为终止清理设置硬兜底，保证工具调用最终结算。
- 防止 stdout/stderr 读取、子进程残留和后台子进程让工具调用无限等待。
- 区分模型思考、工具执行、工具超时、工具失败和取消中的运行状态。
- 将工具超时映射为稳定、可恢复的运行失败，并保留继续运行或重试入口。
- 增加挂起 Shell、超时、取消、进程清理和前端状态投影测试。

## Capabilities

### New Capabilities

无。现有运行时可靠性和聊天 Surface 能力已经拥有可扩展的归属边界。

### Modified Capabilities

- `nexum-model-reliability`: 工具执行必须有界、可取消，并在超时或清理失败时保证稳定结算。
- `nexum-run-lifecycle`: 工具超时、工具取消和清理失败必须进入可观察、可恢复的运行终态。
- `headless-runtime-control`: 页面必须区分模型思考和工具执行，并展示工具超时或取消状态。
- `chat-surface`: ChatSurface 必须投影工具执行、超时、取消和恢复状态，不得用思考心跳覆盖工具状态。

## Impact

- 影响 `packages/nexum-core` 的工具执行生命周期、心跳和超时边界。
- 影响 `packages/nexum-application` 的本地 Shell 子进程启动、输出读取和进程清理。
- 影响 `packages/nexum-surfaces` 与 `packages/nexum-chat-surface` 的实时状态展示。
- 扩展现有测试，不改变公开 HTTP 路径或模型配置格式。
