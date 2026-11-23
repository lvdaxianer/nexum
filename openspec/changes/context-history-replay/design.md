# Design

## Context

当前 `MessageStore` 已按 Session 保存 canonical `ModelMessage[]`，而页面的 `chatItems` 是由 SSE 运行事件临时投影出的有界窗口。两者没有恢复接口，且事件 Hub 只保留每个 Session 最近 256 条事件；因此事件回放不能替代消息历史恢复。相关行为约束见 `proposal.md` 和变更规格。

## Goals / Non-Goals

**Goals:**

- 通过只读 API 安全地读取 `MessageStore` 中的 canonical 消息。
- 使用显式分页，让页面能够从最新消息向上加载更早消息。
- 在恢复历史后继续接收实时 SSE，且避免事件回放重复生成对话条目。
- 保留消息在模型历史中的顺序，并在展示边界对可识别的凭据值做脱敏。

**Non-Goals:**

- 不改变 `messages.json` 的存储格式或 Core 的压缩策略。
- 不把角色提示词、Skill 原文、项目上下文原文或工具定义保存到普通对话历史。
- 不把 `events.json` 改造成完整消息存储，也不提升事件 Hub 的 256 条回放上限。
- 不在本次变更中展示模型完整 prompt 快照；那需要独立的、带权限边界的上下文审计能力。

## Decisions

### 1. 使用 canonical 消息分页接口

新增实验性读取接口 `GET /api/experimental/nexum/session/:sessionID/messages`。查询参数使用 `limit` 和 `before`：缺省 `before` 返回最新一页，后续请求用响应中的 `nextBefore` 向前翻页。响应返回带稳定历史索引的消息条目、`total`、`hasMore` 和 `nextBefore`。

选择分页而不是一次返回全部消息，是为了限制网络传输和浏览器渲染内存；选择索引游标而不是事件序号，是因为消息历史和事件历史是两个独立的持久化集合。读取时先校验 Session 存在，再读取消息，避免把文件访问错误或宿主路径暴露给客户端。

### 2. 协议层定义安全消息投影

`nexum-protocol` 增加公开的 `NexumMessage` 联合类型和分页响应类型；它与 Core 的 `ModelMessage` 保持结构兼容，但不让 Protocol 依赖 Core。Server 从 `MessageStore` 读取后，在响应边界递归调用现有凭据脱敏规则，再返回 JSON。这样 UI 可以展示 tool call、tool result、reasoning 和压缩摘要，同时不会直接暴露模型凭据或工具输出中的 credential-shaped 文本。

### 3. 恢复阶段以消息为准，实时阶段以事件为准

选择 Session 时，UI 先加载最新消息页并将其转换为 `ChatItem`；随后建立 SSE。为避免服务端默认回放最近事件导致历史重复，事件订阅增加 `afterSequence` 选项：UI 使用 Session state 返回的 `lastSequence` 作为恢复游标，只接收加载历史之后的新事件。断线重连仍使用已有 `Last-Event-ID` 语义。

事件投影继续负责流式 Assistant 文本、思考状态、工具执行状态和终态；消息历史负责已完成对话和历史压缩摘要。收到新事件后只更新对应的运行中条目，不替换整个历史列表。

### 4. 页面采用向上分页并保持滚动锚点

对话列表仍使用当前 `conversation-body` 滚动容器。首次加载渲染最新页并跟随底部；当用户接近顶部且 `hasMore` 为真时，设置独立的历史加载状态，请求上一页，记录加载前的 `scrollHeight`，插入消息后按高度差修正 `scrollTop`，避免用户看到的内容跳动。请求进行中不重复触发，失败时保留现有内容并显示可重试状态。

### 5. 保留对话和事件两个视图

现有“对话 / 事件”切换保留不变。对话视图展示 canonical 消息及其运行投影；事件视图继续展示 SSE 事件窗口。上下文压缩卡片可以作为对话中的执行条目显示摘要统计，但不把事件详情当成模型消息。

## Risks / Trade-offs

- [Risk] 历史索引游标在压缩后可能发生整体重排。→ 每次 Session 选择时重新建立分页快照；加载期间用当前响应的 `total` 和索引合并，不跨压缩过程复用旧游标。
- [Risk] 消息内容可能包含工具输出中的敏感值。→ API 响应边界统一递归脱敏；模型继续使用未脱敏的内部 canonical 历史，UI 只拿安全投影。
- [Risk] 历史加载与新运行并发时可能出现一次短暂竞态。→ 先读取 state 的 `lastSequence`，再以该序号订阅事件；页面使用 Session 选择序号丢弃过期响应，并在新运行完成后刷新最新页。
- [Risk] 没有时间戳的 canonical 消息无法恢复精确发送时间。→ 对话历史不伪造时间；实时条目继续使用事件时间，后续若需要时间线再扩展消息元数据。

## Migration Plan

1. 先发布兼容的 Protocol、Server 和 Client；旧 UI 不调用新接口时行为不变。
2. 再发布 Surfaces，选择 Session 时加载消息历史并用 `afterSequence` 连接实时事件。
3. 若新接口或滚动恢复异常，可回滚 Surfaces；不会影响已有 `messages.json`、`events.json` 或运行接口。
