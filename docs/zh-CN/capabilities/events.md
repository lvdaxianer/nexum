# 事件与 SSE 能力

[English](../../capabilities/events.md)

状态：现状基线

权威来源：`packages/nexum-protocol/src/index.ts`、`packages/nexum-core/src/index.ts`、`packages/nexum-persistence/src/events.ts`、`packages/nexum-server/src/index.ts`

最后核对：2026-11-24

## 1. 事件信封

Runtime 事件以 Session 为范围，由 Core 发布到 `EventSink`，Persistence 提供 `NexumEventHub`，Server 再编码为 SSE。协议事件的公共信封如下：

```json
{
  "eventID": "evt_或 UUID",
  "runID": "run_或 UUID",
  "type": "assistant.text",
  "sessionID": "session-id",
  "sequence": 12,
  "occurredAt": "2026-11-24T00:00:00.000Z",
  "data": { "content": "增量文本" }
}
```

字段规则：

| 字段         | 规则                                                     |
| ------------ | -------------------------------------------------------- |
| `eventID`    | 事件唯一标识；SSE `id` 使用它                            |
| `runID`      | 关联一次运行；恢复或兼容事件缺省时 Server 使用 `unknown` |
| `type`       | 必须使用 Protocol 的事件类型；未知扩展仍需保持字符串兼容 |
| `sessionID`  | 事件所属 Session，客户端不得跨 Session 合并              |
| `sequence`   | Session 内递增游标；重启后从持久化的最后序号继续         |
| `occurredAt` | 事件发生时间；Server 对缺省兼容事件补当前时间            |
| `data`       | 按事件类型解释的结构化数据                               |

事件 sequence 是 Session 游标，不是全局游标。客户端应以 `(sessionID, sequence)` 作为顺序语义，并以 `eventID` 做重复投递去重。

## 2. 当前事件类型

`packages/nexum-protocol/src/index.ts` 当前公开以下事件类型：

| 类别           | 事件                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Assistant 输出 | `assistant.thinking`、`assistant.reasoning`、`assistant.text`                                                       |
| 工具           | `tool.request`、`tool.result`                                                                                       |
| 交互           | `permission.requested`、`question.request`、`question.result`、`question.cancelled`                                 |
| Context        | `context.compaction.started`、`context.compaction.completed`、`context.compaction.failed`、`context.project.loaded` |
| Skill          | `skill.updated`、`skill.activated`、`skill.failed`                                                                  |
| Model          | `model.attempt`、`model.retry`                                                                                      |
| Runtime        | `coding-loop.limit.reached`                                                                                         |
| 终态           | `session.completed`、`session.failed`、`session.cancelled`、`run.settled`                                           |

有明确 Protocol 数据类型的事件包括：`model.attempt`（`attempt`、`maxRetries`）、`model.retry`（增加 `delayMs`、`errorCode`、`willRetry`）、`skill.updated`（`change`、`skillID`、可选 `status`）和 `run.settled`（`result`）。其他事件的 `data` 是 JSON 对象，由对应能力文档或具体实现解释；客户端不得把未知字段强行转成文本。

## 3. SSE 连接

端点：

```text
GET /api/nexum/session/{sessionID}/events
```

响应使用 `text/event-stream; charset=utf-8`、`cache-control: no-store` 和长连接。连接建立后先发送注释帧：

```text
: nexum-events-connected

```

每个事件编码为：

```text
event: assistant.text
id: event-id
data: {"eventID":"event-id","runID":"run-id","type":"assistant.text","sessionID":"session-id","sequence":12,"occurredAt":"...","data":{"content":"增量文本"}}

```

客户端可以通过以下任一游标恢复：

- `Last-Event-ID: <eventID>`：HTTP 标准 SSE 重连 Header。
- `?after=<eventID>`：兼容查询参数。
- `?afterSequence=<非负整数>`：按 Session sequence 恢复。

同时提供 event ID 和 sequence 时，Server 使用二者中更靠后的游标，避免重连时重复回放。游标未命中且只提供 event ID 时，Event Hub 会从当前可用历史开始；因此客户端应优先同时保存 event ID 和 sequence，并在重连后以事件去重。

## 4. 回放、持久化与淘汰

Event Hub 默认只保存在进程内；配置 `filePath` 后按 JSON 文件持久化，并使用临时文件加 rename 写入。每个 Session 最多保留最近 `256` 条事件；最旧事件淘汰后，过早的 event ID 可能无法命中，只能退化为 sequence 过滤。

文件首次加载通过 `ready()` 等待。文件不存在表示空历史；格式损坏或写入失败抛出 `NexumEventStoreError`，不会把内部文件路径暴露给 HTTP 调用方。

订阅者有 `512` 个 event ID 的去重窗口。事件回放和实时推送都进入同一订阅队列，客户端仍必须做自己的去重，因为断线、代理重试和多次 state 恢复都可能让同一事实被再次观察。

## 5. 终态与客户端投影

一次运行结束时，Core 发布对应的 `session.completed`、`session.failed` 或 `session.cancelled`，随后发布一次 `run.settled`，其 `data.result` 为 `completed`、`failed` 或 `cancelled`。发布终态事件失败时，Core 仍保留运行清理与 Session 状态处理的错误语义，UI 不应仅依赖某一帧 SSE 判定成功。

推荐投影策略：

1. 以 `eventID` 去重，丢弃已经应用的事件。
2. 对同一 Session 只接受比当前游标更大的 `sequence`；发现空洞时保留当前投影并执行 state/history 恢复。
3. `assistant.text`、`assistant.reasoning` 追加到当前 assistant 卡片；`tool.request` 与 `tool.result` 按 `toolCallID` 关联。
4. `permission.requested` 与 `question.request` 创建 pending 卡片，result/cancelled 关闭对应卡片。
5. `model.retry` 只更新重试提示，不把一次重试误显示为新的用户消息。
6. 终态事件更新 Session 展示状态；`run.settled` 作为运行结算事实，用于解除 busy/重试锁。

## 6. 断线恢复流程

```text
记录最后 eventID/sequence
  → SSE 断开
  → GET /session/{id}/state
  → GET messages（必要时按 snapshot 分页）
  → SSE Last-Event-ID + afterSequence 重连
  → 去重并补齐事件
  → 以 terminal/run.settled 解锁 UI
```

如果 state 的 `lastSequence` 大于本地游标，说明本地可能漏事件；优先从该序号重新订阅。若事件已被历史窗口淘汰，则以 canonical history 和当前 state 重建可见投影，不能把“缺少某个中间事件”当作服务器失败。

## 7. 相关入口

- [Session 会话能力](session.md)
- [UI 交互协议](../ui/interaction-protocol.md)
- [UI 状态与恢复](../ui/states.md)
- [Runtime 运行流程](../architecture/runtime-flow.md)
- [Nexum HTTP API](../../../apis/zh-CN/nexum.md)
- [Protocol 事件定义](../../../packages/nexum-protocol/src/index.ts)
- [Server SSE 测试](../../../packages/nexum-server/test/server.test.ts)
