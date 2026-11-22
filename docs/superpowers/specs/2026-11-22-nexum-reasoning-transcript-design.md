# Nexum Reasoning Transcript 设计

## 目标

把模型实际返回的 reasoning 增量作为 Core 和 Protocol 的标准运行事实输出，由 UI 将其呈现为连续向下追加的 transcript。用户能看到当前分析摘要、工具调用、工具结果和最终回答的时间顺序；不同 UI 可以选择不同的视觉呈现。

## 分层边界

- Model Adapter：把上游流中的 reasoning 字段转换为 Core 的 reasoning chunk；只保留模型适配语义。
- Core：发布 `assistant.thinking` 心跳和 `assistant.reasoning` 增量事件，复用既有 `runID`、`sequence`、SSE 回放和消息持久化边界。reasoning 不写入可见 assistant 文本，但继续写入 canonical assistant 消息供后续模型上下文使用。
- Protocol：以字面量联合类型定义事件名，并定义 reasoning/text 的安全数据字段；不包含卡片、段落、颜色或滚动规则。
- Server：从 Protocol 事件清单生成能力发现结果，SSE 原样透传事件身份和数据。
- Client：解析标准事件，保持事件数据类型可消费。
- UI：将连续的 reasoning 增量合并到当前 reasoning transcript 段，遇到工具或 assistant 文本时结束当前段；不再把 reasoning 塞入 assistant 最终回答或大卡片。

## 事件语义

`assistant.thinking` 是没有可展示 reasoning 文本时的运行心跳，数据可以包含安全的 `message` 与 `elapsedMs`。`assistant.reasoning` 是模型实际返回的文本增量，数据只包含 `content`。`assistant.text` 继续表示最终可见回答增量。三类事件都使用现有事件身份字段，UI 以 `sequence` 为唯一顺序依据。

reasoning 不新增独立的 `started/ended` 事件：第一次 `assistant.reasoning` 开始一个 transcript 段；下一个工具、文本或终态事件关闭该段。这样兼容当前 Core 已有事件，且不会要求 Provider 伪造生命周期。

## UI 交互

reasoning 段使用弱化正文色、左侧细线和“思考中”元信息；内容按增量实时追加，末尾显示短光标。工具请求和结果继续以轻量执行行插入；最终回答使用正常正文样式。底部跟随规则沿用现有行为：用户在底部时自动滚动，用户上翻时不抢焦点，并保留回到底部的恢复路径。

没有 reasoning 的模型只显示心跳/运行状态，不生成假思考文字。断线重连收到历史 reasoning 事件时，UI 按事件顺序重建 transcript；已完成段落不得被后续 assistant 文本覆盖。

## 验证

- Protocol 测试验证事件类型清单、reasoning/text 数据契约和能力发现。
- Core 测试验证 reasoning 增量、静默心跳、工具边界和 canonical 历史。
- Server 测试验证 reasoning 事件经过 SSE 且顺序/回放不变。
- UI smoke 测试验证 reasoning 段落实时追加、工具行插入、最终回答分离、无 reasoning 降级和完成状态。
- 完成包级 typecheck、相关测试和根级 `bun run check`；最后执行 OpenSpec 验证与合并前审计。
