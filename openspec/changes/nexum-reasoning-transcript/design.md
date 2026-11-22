# Design

## Context

当前 Nexum Core 已将上游 reasoning 增量转换为 `assistant.reasoning`，并在模型静默时发布 `assistant.thinking`；事件已复用 `runID`、会话序列和 SSE 回放。问题在于 `@nexum/protocol` 仍把事件类型声明为任意字符串，Server 维护另一份未类型化清单，UI 则把 reasoning 与等待状态放在同一个占位条目中。详细动机见 `proposal.md`，行为要求见对应 delta spec。

## Goals / Non-Goals

**Goals:**

- 让 Protocol 成为 Nexum reasoning 事件名称和公开数据形状的唯一契约来源。
- 保持 Core 已有 reasoning 增量、heartbeat、canonical history 和事件序列语义。
- 让 Server 能力发现与 Protocol 事件清单一致，并保持旧客户端可忽略未知事件的兼容方式。
- 让 UI 在同一 transcript 中显示独立 reasoning 段、工具行和最终回答，并正确处理回放与终态。

**Non-Goals:**

- 不让 UI 生成或补写模型没有返回的 reasoning。
- 不新增 reasoning 数据库表、HTTP 命令或第二条执行循环。
- 不规定其他 UI 必须采用当前 Web transcript 的视觉样式。
- 不把供应商私有签名、加密 reasoning 元数据暴露到公开事件。

## Decisions

### 1. 复用现有事件名称，补齐 Protocol 类型

Protocol 新增 `NexumEventType` 字面量联合和 `NEXUM_EVENT_TYPES` 常量，至少覆盖现有 `assistant.thinking`、`assistant.reasoning`、`assistant.text` 以及工具、权限、Question、上下文、Skill 和终态事件。Server 直接引用该清单，避免协议与能力发现漂移。

备选是改名为 `reasoning.started/delta/ended`，但当前 Core 已经在生产事件流中使用 `assistant.reasoning`，且事件本身以增量为单位；在没有真实 Provider 生命周期事件时强行新增 started/ended 会制造伪语义，因此本次保留兼容名称。

### 2. 使用事件顺序表达 reasoning 生命周期

Core 不新增独立的结束事件。第一次 reasoning 增量创建 UI 段，下一条工具请求、最终文本或终态事件关闭该段。`assistant.thinking` 只表达模型仍在运行但没有可展示文本的心跳；它不能被 UI 当作 reasoning 正文。

这样可以复用现有的单调 `sequence`、Last-Event-ID 回放和去重逻辑，也能兼容一次模型响应中 reasoning 后接工具调用的顺序。

### 3. UI 使用独立 reasoning 条目

UI 的 `ChatItem` 增加 `reasoning` kind，reasoning delta 只更新当前同一 `runID` 的开放段；工具请求/结果和 assistant 文本都作为独立条目追加。最终回答不再覆盖 reasoning 条目，也不把 reasoning 文本写入 assistant 的可见正文。

视觉上使用弱化正文、左侧细线和流式光标；heartbeat 没有正文时只显示轻量状态行。移除思考卡片结构和相关动画，保留现有底部自动跟随/上翻暂停逻辑。

### 4. 协议类型保持向后兼容

`NexumEvent.data` 继续允许安全 JSON 对象，新增 reasoning 相关的公开字段类型用于编译期和测试约束，不改变 SSE 顶层身份字段。旧客户端收到 reasoning 事件时可以按协议约定忽略或展示通用时间线；新 UI 通过能力发现判断事件可用性。

## Risks / Trade-offs

- [Risk] 部分 Provider 只返回 heartbeat 或最终 reasoning，无法提供逐 token 内容 → [Mitigation] Core 只发布实际收到的增量；UI 明确显示运行状态，不伪造正文。
- [Risk] reasoning 文本可能很长，连续 transcript 会增加 DOM 和内存 → [Mitigation] 沿用现有 `maxChatItems` 窗口，并在每个 reasoning 条目内合并增量而不是按 token 创建条目。
- [Risk] 事件重连可能重放已应用增量 → [Mitigation] 继续使用 `eventID` 去重和 sequence 顺序，UI 测试覆盖 replay 场景。
- [Risk] Protocol 清单和 Core 字符串可能再次漂移 → [Mitigation] Server 使用 Protocol 导出的清单，Protocol 测试断言 reasoning 事件存在，Core 事件测试断言实际名称。

## Migration Plan

1. 先补 Protocol 类型和测试，再让 Server 使用共享事件清单。
2. 保持现有 Core 事件名称和数据格式，补 Core/Server 回归断言，不需要数据迁移。
3. 更新 UI transcript 投影与样式，保留能力不支持时的 heartbeat 降级。
4. 运行包级测试、UI smoke、typecheck 和根级检查；失败时可回滚 UI 而不影响 Core 事件兼容。

## Open Questions

无。事件名称、增量语义和 UI 生命周期已由本设计与 delta spec 固定。
