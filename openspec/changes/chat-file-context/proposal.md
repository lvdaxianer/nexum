# Proposal

## Why

ChatSurface 当前只能发送手工输入的文本，用户无法直接围绕本地 Markdown 或纯文本文件提问。内部演示和日常编码交流需要先打开文件、复制内容再粘贴，既增加操作成本，也容易遗漏上下文。

## What Changes

- 为 ChatSurface 增加本地 `.md` / `.txt` 文件选择入口。
- 在浏览器端读取单个文件内容，并在发送时将文件名和全文作为明确的文件上下文附加到当前 Prompt。
- 展示已选择文件、读取中、移除、类型错误、大小超限和读取失败状态。
- 发送成功后清理附件；发送失败时保留原输入和附件，允许修正或重试。
- 不新增上传接口，不把本地文件路径发送到服务端，不改变现有 Prompt 协议。

## Capabilities

### New Capabilities

- 无。该功能扩展现有 ChatSurface 行为，不新增独立能力边界。

### Modified Capabilities

- `chat-surface`: Prompt composer 支持本地 Markdown/纯文本文件上下文，并定义文件选择、读取、发送和失败恢复行为。

## Impact

- 受影响代码：`packages/nexum-chat-surface/src/chat-surface.tsx`、`packages/nexum-chat-surface/src/styles.css`，以及对应测试。
- 受影响文档：ChatSurface 组件说明和 OpenSpec delta。
- 不影响 Protocol、Client、Server 和运行时依赖方向；现有 JSON Prompt 接口继续承载拼接后的文本。
