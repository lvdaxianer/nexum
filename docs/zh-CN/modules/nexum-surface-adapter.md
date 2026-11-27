# `nexum/surface-adapter`

[English](../../modules/nexum-surface-adapter.md)

源码模块：`@nexum/surface-adapter`。用户安装唯一公共包 `nexum` 后，从 `nexum/surface-adapter` 导入聊天协议适配器。

状态：现状基线

权威来源：[`packages/nexum-surface-adapter/src/index.ts`](../../../packages/nexum-surface-adapter/src/index.ts)、[`packages/nexum-surface-adapter/README.md`](../../../packages/nexum-surface-adapter/README.md)

最后核对：2026-11-24

## 职责

`@nexum/surface-adapter` 是聊天类 Surface 面向协议的适配层。它定义 `ChatProtocolAdapter` 契约，把 Chat UI 需要的协议操作（历史、状态、事件订阅、发消息、Permission/Question 回复、取消/继续）收敛为一组稳定方法，并提供基于 `@nexum/client` 的默认实现和协议错误归一化。

它不负责 Session 业务规则、权限策略、事件去重或 UI 渲染；这些分别由 Server/Application/Core 和各 Surface 自己负责。

## 公开 API

入口 [`src/index.ts`](../../../packages/nexum-surface-adapter/src/index.ts) 导出 `CHAT_PROTOCOL_METHODS`、`ChatProtocolAdapter`、`ChatProtocolError`、`normalizeChatProtocolError`、`createChatProtocolAdapter` 以及请求/标识类型，并重新导出 `NexumEvent`、`NexumPermission`、`NexumQuestion`、`NexumSession`、`NexumSessionMessages`、`NexumSkill` 协议类型。

```ts
import { createChatProtocolAdapter } from "nexum/surface-adapter"

const adapter = createChatProtocolAdapter({ baseUrl: "http://127.0.0.1:4097" })

const state = await adapter.loadState(sessionID)
for await (const event of adapter.subscribeEvents({ sessionID, afterSequence: state.lastSequence })) {
  console.log(event.sequence, event.type)
}
```

`createChatProtocolAdapter` 接受 `@nexum/client` 的 `NexumClientOptions`（`baseUrl`、自定义 `fetch` 等），不传时连接默认地址。宿主也可以不依赖默认实现，自行实现 `ChatProtocolAdapter` 契约接入任意传输。

| API                                  | 参数                                     | 返回值                      | 作用                               |
| ------------------------------------ | ---------------------------------------- | --------------------------- | ---------------------------------- |
| `createChatProtocolAdapter(options)` | `baseUrl?`、`fetch?`                     | `ChatProtocolAdapter`       | 创建基于 Nexum Client 的默认适配器 |
| `adapter.loadHistory(input)`         | `sessionID`、分页参数                    | 消息历史                    | 加载 Session 历史                  |
| `adapter.loadState(sessionID)`       | `sessionID`                              | Session 状态                | 获取恢复快照                       |
| `adapter.subscribeEvents(input)`     | `sessionID`、`afterSequence?`、`signal?` | `AsyncIterable<NexumEvent>` | 订阅并恢复事件                     |
| `adapter.sendMessage(input)`         | `sessionID`、`text`                      | 受理结果                    | 提交用户消息                       |
| `adapter.replyPermission(input)`     | `sessionID`、`requestID`、`decision`     | 回复结果                    | 回复工具权限请求                   |
| `adapter.replyQuestion(input)`       | `sessionID`、`requestID`、`answers`      | 回复结果                    | 回复结构化反问                     |

## 方法分组

`ChatProtocolAdapter` 覆盖 `CHAT_PROTOCOL_METHODS` 列出的十个方法：

| 分组       | 方法                                  | 作用                                               |
| ---------- | ------------------------------------- | -------------------------------------------------- |
| 历史与状态 | `loadHistory()`、`loadState()`        | 分页加载历史消息、读取会话状态快照                 |
| 事件       | `subscribeEvents()`                   | 从 `afterSequence` 之后订阅会话 SSE 事件           |
| Skill      | `listSkills()`                        | 查询可用于 `@skill` 自动补全的技能列表             |
| 消息       | `sendMessage()`                       | 向会话发送用户消息                                 |
| Permission | `replyPermission()`                   | 回复权限请求（`allow_once`/`allow_always`/`deny`） |
| Question   | `replyQuestion()`、`cancelQuestion()` | 提交问题答案或取消待回答问题                       |
| 运行控制   | `cancelRun()`、`continueRun()`        | 取消当前运行、继续可恢复的运行                     |

具体 URL、请求字段和响应状态见 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md)。

## 错误归一化

默认实现把 `@nexum/client` 抛出的 `NexumClientError` 和未知异常统一转换为 `ChatProtocolError`，保留 `status`、稳定 `code`、`message` 和可选 `traceId`；无法识别的异常归为 `CHAT_PROTOCOL_UNKNOWN_ERROR`。Surface 只需处理这一种错误类型，不需要了解底层客户端错误。

## 依赖边界

该包运行时只依赖 [`@nexum/client`](./nexum-client.md)，被 [`@nexum/chat-surface`](./nexum-chat-surface.md) 和 [`@nexum/cli`](./nexum-cli.md) 消费。它不能依赖 Core、Application、Server 或具体 UI；聊天 Surface 不各自实现协议逻辑，统一复用本契约。

## 能力映射

- 事件订阅：承载 [`docs/capabilities/events.md`](../capabilities/events.md) 的事件序列与恢复游标（`afterSequence`），去重和投影由 Surface 负责。
- Permission/Question：把 [`docs/ui/permission.md`](../ui/permission.md) 与 [`docs/ui/question.md`](../ui/question.md) 的用户决定映射为协议回复。
- 交互协议：方法集对应 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md) 中聊天场景需要的请求/响应通道。

## 修改同步清单

- 增加或修改适配方法：同步 `CHAT_PROTOCOL_METHODS`、`@nexum/chat-surface` 的 re-export、[`@nexum/cli`](./nexum-cli.md) 的消费点和契约测试。
- 修改错误归一化：同步 [`docs/ui/states.md`](../ui/states.md) 的错误/恢复状态说明和两个消费包的测试。
- 修改事件订阅参数：同步 [`docs/capabilities/events.md`](../capabilities/events.md) 和 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md)。
