# Proposal

## Why

发送带文件上下文的消息后，用户气泡有时会被异步状态初始化、历史回放或长回复后的滚动位置遮住，造成“消息没有发送/没有展示”的错觉。需要让即时消息、历史消息和事件流在同一条会话链路中稳定合并，并保证刷新后仍能看到用户问题和附件摘要。

## What Changes

- 发送成功后立即保留用户问题和附件摘要，不依赖后续事件流才能展示。
- 合并 Session 状态、分页历史和实时事件时保留已渲染的用户消息，并避免同一条消息重复出现。
- 运行结束或历史重新加载后，仍能恢复用户问题与文件名摘要；完整文件正文继续只作为模型上下文保存。
- 调整发送后的滚动定位，避免长回答生成后用户问题被误认为消失。
- 增加覆盖即时发送、运行完成、刷新历史恢复和文件附件回显的回归测试。

## Capabilities

### New Capabilities

### Modified Capabilities

- `chat-surface`: 明确用户消息在即时渲染、状态/历史初始化、事件回放和刷新恢复过程中的保留、去重与可见性要求。

## Impact

- 影响 `packages/nexum-chat-surface` 的消息投影、历史合并、发送流程和滚动交互。
- 影响 `packages/nexum-chat-surface/test` 与 `packages/nexum-surfaces/test/permission.smoke.spec.ts` 的回归覆盖。
- 不修改 Prompt API、Server HttpApi 或文件存储协议；继续使用现有的完整 Prompt 历史记录。
