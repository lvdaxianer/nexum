# Proposal

## Why

Nexum Core 已经能够接收模型返回的 reasoning 增量，但协议层仍把事件类型声明为任意字符串，UI 也把 reasoning 混入“正在思考”占位卡片，用户无法在连续执行流中看到模型实际返回的思考摘要。现在需要把 reasoning 作为跨 Core、Protocol、Server、Client 的稳定运行事实输出，并让 UI 独立决定呈现方式。

## What Changes

- 将 `assistant.thinking`、`assistant.reasoning` 和 `assistant.text` 纳入 Nexum Protocol 的稳定事件类型与数据契约。
- 保持 Core 按模型增量发布 reasoning，保证 reasoning、工具调用、工具结果和最终文本按事件序列排序。
- 让 Server 的能力发现使用 Protocol 定义的事件清单，避免服务端维护未类型化的重复字符串。
- 将 UI 的 reasoning 从思考占位卡片改为连续 transcript 段落，实时追加并保留在工具和最终回答之间。
- 处理无 reasoning、模型静默、断线回放、运行完成、失败和取消等状态，不伪造模型未返回的思考内容。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `headless-runtime-control`: 页面可以通过标准运行事件观察模型 reasoning 增量，并在连续运行流中按事件顺序展示 reasoning、工具和最终文本。

## Impact

- Core：`packages/nexum-core` 的模型增量和运行事件类型。
- Protocol：`packages/nexum-protocol` 的事件类型、事件数据和能力发现契约。
- Server：`packages/nexum-server` 的事件清单与 SSE 契约。
- Client：`packages/nexum-client` 的事件类型消费。
- UI：`packages/nexum-surfaces/src/main.tsx`、`styles.css` 及 smoke tests。
- 文档：Nexum Protocol/运行事件说明和 OpenSpec 变更资产。
