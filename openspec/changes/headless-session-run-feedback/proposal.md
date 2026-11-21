# Proposal

## Why

Headless 工作台当前把上一轮运行完成的 Session 当作不可再次运行的终态，导致后续 Prompt
虽然返回 `accepted`，实际运行却没有启动，前端因此永久显示“回复中”。同时，模型在返回
首段文本前，主对话区域没有明确反馈，用户无法判断 Agent 是否正在思考。

## What Changes

- 允许已完成、失败或取消的 Session 启动新的 Prompt 运行。
- 拒绝同一 Session 的并发运行，并返回稳定的冲突错误。
- 为 Prompt 运行增加“思考中、流式回答、完成、失败、取消”可观察状态。
- 在回答区域增加带 reduced-motion 兼容的思考动画，并在首个文本事件到达时替换为回答流。
- 保留失败 Prompt 和恢复入口，避免前端输入被永久锁定。

## Capabilities

### New Capabilities

- `headless-session-run-feedback`: 覆盖 Session 可继续运行、并发运行保护和运行反馈状态。

### Modified Capabilities

无。

## Impact

- 修改 `packages/headless-core` 的 Session 状态迁移和 Coding Loop 启动边界。
- 修改 `packages/headless-server` 的 Prompt admission 冲突响应。
- 修改 `packages/headless-ui` 的聊天状态投影、思考动画和恢复交互。
- 新增 Core、Server 和 UI 的回归测试；不改变已有 API 路径和数据文件格式。
