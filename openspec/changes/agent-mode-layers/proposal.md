# Proposal

## Why

当前页面无法在 Session 卡片和新建流程中明确表达 Agent 正处于 Plan 还是 Build，用户也不能在创建 Session 时选择初始模式。已有模式能力需要从 Core、Protocol 和 Application 三层形成一致的实例化契约，避免 UI 状态与实际执行边界脱节。

## What Changes

- 在 Core 层支持 Session Service 的默认 Agent 模式，并允许单个 Session 创建参数覆盖默认值。
- 在 Protocol 层完整暴露 Session 创建时的 `mode` 参数，并在响应中返回规范化模式。
- 在 Application 层支持 Runtime 实例化时配置默认 Agent 模式，并把该配置传递给 Core。
- 在 Surface 层的 Session 创建表单中选择 Plan/Build，并在 Session 列表、当前 Session 标题和 Composer 控制区显示当前模式。
- 保持未指定模式时默认使用 Build；运行中的 Session 不允许切换模式。

## Capabilities

### New Capabilities

- `agent-mode-selection`: 贯穿 Application、Protocol、Core 和页面的 Plan/Build 实例化与可见性契约。

### Modified Capabilities

- `headless-session-control`: Session 创建和页面管理增加 Agent 模式选择、展示和稳定状态同步。
- `chat-surface`: 宿主页面需要在 ChatSurface 外部展示当前 Agent 模式，并保持模式切换与 Composer 状态一致。

## Impact

- 修改 `packages/nexum-core` 的 Session Service 配置、创建默认值和相关测试。
- 修改 `packages/nexum-application` 的 Runtime Options 与 Runtime 组合逻辑。
- 修改 `packages/nexum-protocol`、`packages/nexum-client` 和 `packages/nexum-server` 的 Session 创建契约与测试。
- 修改 `packages/nexum-surfaces` 的创建表单、Session 列表和当前 Session 展示，并增加交互测试。
- 更新 `apis/nexum.md`、Session/Client 文档和 OpenSpec 能力说明。
