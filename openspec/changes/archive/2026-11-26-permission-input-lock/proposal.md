# Proposal

## Why

CLI 在等待工具权限确认时仍会接收模型的 thinking 心跳，并把动画重新绘制到权限输入行上，导致用户看见“正在思考”却无法输入审批选项。该问题会阻塞工具执行和整个会话，需要在权限交互期间保持输入提示可操作且状态准确。

## What Changes

- 权限或 Question 等待期间，CLI 不再启动或重绘模型思考动画。
- 权限等待状态持续到用户提交决定，避免后续 heartbeat 覆盖交互提示。
- 增加回归测试，覆盖权限请求后收到 thinking/reasoning 心跳的场景。

## Capabilities

### New Capabilities

### Modified Capabilities

- `headless-runtime-control`: 补充 CLI 在待审批交互期间保持工具等待状态和可用输入提示的要求。

## Impact

- 影响 `packages/nexum-cli/src/render.ts` 的运行状态与活动行渲染。
- 影响 `packages/nexum-cli/test/render.test.ts` 的终端状态回归测试。
- 不修改 Protocol、Server API、权限策略语义或运行时依赖。
