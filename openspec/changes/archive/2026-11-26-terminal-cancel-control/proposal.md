# Proposal

## Why

运行已经完成后，聊天输入区仍显示并允许点击“取消运行”，会让用户误以为 Session 仍在执行，也可能向后端发起没有意义的取消请求。终态操作应与当前运行状态保持一致。

## What Changes

- Core 根据 Session 生命周期计算 `canCancel`，并拒绝对终态或空闲 Session 的取消请求。
- Protocol 在 Session State 中传递 `canCancel`，让各客户端使用统一的能力状态。
- 应用层使用协议返回的 `canCancel` 控制“取消运行”入口，而不是自行猜测状态。
- 保留取消确认流程和已有取消请求反馈，并增加三层契约与 UI 回归测试。

## Capabilities

### New Capabilities

### Modified Capabilities

- `chat-surface`: 取消运行操作只在协议声明可取消的运行状态下可见并可用。

## Impact

- 影响 `packages/nexum-core` 的 Session 取消能力和终态校验。
- 影响 `packages/nexum-protocol` 的 Session State 契约及其使用方。
- 影响 `packages/nexum-server` 的状态投影和取消错误边界。
- 影响 `packages/nexum-chat-surface`、`packages/nexum-surfaces` 的能力消费和 UI 验证。
