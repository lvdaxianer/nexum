# Session 会话能力

状态：现状基线

权威来源：`packages/nexum-core/src/index.ts`、`packages/nexum-persistence/src/session-store.ts`、`packages/nexum-persistence/src/message-store.ts`、`packages/nexum-server/src/index.ts`

最后核对：2026-11-24

## 1. Session 是什么

Session 是一个绑定工作目录的可恢复运行容器。它保存最小会话元数据和 canonical 消息历史；模型临时注入的角色提示词、Skill 系统消息、项目上下文和工具定义不自动写入 canonical 历史。

Session 元数据的公共形状如下：

| 字段        | 类型                                                  | 语义                             |
| ----------- | ----------------------------------------------------- | -------------------------------- |
| `id`        | `string`                                              | Session ID，创建时生成且稳定     |
| `name`      | `string`                                              | 展示名称；创建时缺省为工作目录名 |
| `directory` | `string`                                              | 规范化后的绝对工作目录           |
| `status`    | `idle \| running \| completed \| failed \| cancelled` | 当前生命周期状态                 |
| `createdAt` | `string`                                              | ISO 时间                         |
| `updatedAt` | `string`                                              | 最近一次元数据或状态变更时间     |

创建时 `directory` 必须是非空绝对路径，并通过目录校验器；名称为空会被拒绝。Session 列表按更新时间倒序返回。

## 2. 最小使用流程

如果通过 TypeScript Client 使用 Server，Session 的完整调用链是：

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "demo",
})

await client.experimental.nexum.session.prompt({
  sessionID: session.id,
  text: "检查这个项目的目录结构",
})

for await (const event of client.experimental.nexum.session.events({
  sessionID: session.id,
})) {
  console.log(event.type, event.data)
}
```

角色提示词不放在 `session.prompt` 中。它属于 Runtime 级别的配置，通过 `rolePrompt` 设置；`prompt.text` 只表示用户这一次提交的任务。Coding Loop 会自动把角色提示词、历史消息、用户输入、Skill 和工具定义组合后交给模型。

## 3. Session API 查询

下面的 Client 方法都位于 `client.experimental.nexum.session`。HTTP/SSE 调用方可以在 [Nexum Runtime API](../../apis/nexum.md) 中查询对应的 URL、请求体、响应和错误码。

如果页面需要显示会话列表，先调用 `list()`；用户点击某个会话后，把返回的 `id` 保存为当前 `sessionID`，再交给 [ChatSurface](../modules/nexum-chat-surface.md) 或自定义聊天页面。不要把 `name` 当作唯一标识，切换和后续请求都使用 `id`。

| 方法                     | 参数                                                   | 返回值                      | 用途                                              |
| ------------------------ | ------------------------------------------------------ | --------------------------- | ------------------------------------------------- |
| `create(input)`          | `directory` 必填；`name` 可选                          | `NexumSession`              | 创建一个绑定工作目录的会话                        |
| `list()`                 | 无                                                     | `NexumSession[]`            | 查询当前 Runtime 的会话列表                       |
| `state(input)`           | `sessionID` 必填                                       | `NexumSessionState`         | 查询状态、待处理权限/反问和事件游标               |
| `messages(input)`        | `sessionID` 必填；`before`、`limit`、`snapshotID` 可选 | `NexumSessionMessages`      | 分页读取消息历史；当前为实验性接口                |
| `update(input)`          | `sessionID`、`name` 必填                               | `NexumSession`              | 修改会话展示名称                                  |
| `delete(input)`          | `sessionID` 必填                                       | `{ id, deleted: true }`     | 删除会话及其历史、交互和事件                      |
| `prompt(input)`          | `sessionID`、`text` 必填                               | `{ status: "accepted" }`    | 提交用户任务并异步启动运行                        |
| `continue(input)`        | `sessionID` 必填                                       | `{ status: "accepted" }`    | 从可恢复的 User/Tool 上下文继续；当前为实验性接口 |
| `cancel(input)`          | `sessionID` 必填                                       | `{ status: "cancelled" }`   | 取消当前运行和待处理交互                          |
| `events(input, options)` | `sessionID` 必填；`afterSequence`、`signal` 可选       | `AsyncIterable<NexumEvent>` | 订阅实时事件，并支持断线续订                      |

### 参数怎么理解

| 参数            | 含义                        | 从哪里获得                                                 |
| --------------- | --------------------------- | ---------------------------------------------------------- |
| `sessionID`     | 目标会话的唯一标识          | `create()` 返回的 `session.id`，或 `list()` 返回的会话记录 |
| `directory`     | Agent 可以工作的绝对目录    | 宿主应用选择的项目目录                                     |
| `name`          | 给用户看的会话名称          | 应用标题或项目名称，可后续修改                             |
| `text`          | 用户本次要 Agent 完成的任务 | 输入框、任务队列或业务请求                                 |
| `before`        | 历史分页的结束位置          | 上一次 `messages()` 返回的分页游标                         |
| `limit`         | 一次读取的历史条数          | 页面按需设置，服务端有最大值                               |
| `snapshotID`    | 历史分页使用的快照          | 第一次 `messages()` 返回的 `snapshotID`                    |
| `afterSequence` | 从哪个事件序号之后继续接收  | `state().lastSequence` 或本地已处理的最大序号              |

### Session 和 Prompt 的关系

```text
create({ directory, name })
          ↓
      session.id
          ↓
prompt({ sessionID, text })
          ↓
  Coding Loop 读取 Session 历史
          ↓
  组合角色提示词、Skill、工具和上下文
          ↓
        ModelPort
          ↓
   文本、工具、权限、Question 和终态事件
```

## 4. 生命周期

Core 只允许以下状态转移：

```text
idle ───────→ running ───────→ completed
  │              │               │
  └────────────→ cancelled       ├────→ running（继续）
                                 ├────→ running（继续）
                                 └────→ running（继续）

running ─────→ failed
```

更精确地说：`idle` 可以进入 `running` 或 `cancelled`；`running` 可以进入 `completed`、`failed` 或 `cancelled`；三个终态都允许在有可继续上下文时重新进入 `running`。重复设置同一状态是幂等的，其他转移返回 `invalid_transition`。

一次 Prompt 的运行边界如下：

1. Server 校验 Session 存在并受理 Prompt。
2. Core 先将用户消息写入 canonical history，再进入 `running`。
3. 模型输出、工具调用、Question、Permission 和上下文压缩在同一 Session 的事件序列中推进。
4. 正常输出进入 `completed`；取消进入 `cancelled`；未恢复的运行错误进入 `failed`。
5. 运行结束后释放本地运行占用；新的 Prompt 或 Continue 需要重新受理。

同一个 Session 同时只能有一个活动运行。重复 Prompt、Continue 或并发启动会得到 `NEXUM_SESSION_RUN_CONFLICT`，调用方应保留当前 UI 状态并等待终态或执行取消。

## 5. Canonical 消息历史

消息历史由 `MessageStore` 按 Session 保存，支持以下角色：

- `system`：需要跨 Prompt 保留的系统消息，可带 `sourceID`。
- `user`：用户输入。
- `assistant`：文本、推理内容和工具调用。
- `tool`：与工具调用 ID 关联的工具结果。

运行时只把 canonical history 作为恢复基础。角色 Prompt、Skill 内容和项目上下文是本轮模型请求的临时注入；上下文压缩生成的 canonical summary 才会写回历史。

历史读取使用实验性端点 `GET /api/experimental/nexum/session/{sessionID}/messages`，返回 `index`、`message`、`total`、`hasMore`、`nextBefore` 和 `snapshotID`。分页读取使用 `before`，默认 `limit=50`，最大 `100`；当客户端携带的 `snapshot` 已失效时，服务返回 `NEXUM_HISTORY_SNAPSHOT_EXPIRED`，客户端应丢弃旧游标并从新快照重新分页。

Session 删除是组合清理：先拒绝正在运行的 Session，再删除消息历史、pending Interaction、事件历史和 Session 索引。删除不存在的 Session 返回 `NEXUM_SESSION_NOT_FOUND`；删除失败不得只从 UI 列表移除而不提示调用方。

## 6. 页面恢复协议

推荐的恢复顺序：

1. 调用 `GET /api/nexum/session/{sessionID}/state` 获取 Session 快照、`canContinue`、pending Permission/Question 和 `lastSequence`。
2. 调用 messages 端点加载最新一页 canonical history；需要向上滚动时使用同一 `snapshotID` 分页。
3. 使用 `lastSequence` 订阅 `GET /api/nexum/session/{sessionID}/events`，只接受更大的 sequence。
4. 先用 history 恢复可见对话，再用事件修正流式文本、思考、工具卡片和运行状态。

`state` 和 history 是两个独立读取模型：state 表示当前快照，history 表示可见对话，SSE 表示运行过程。不要用“最后一段文本”推断 Session 是否完成，也不要把事件流当作唯一历史来源。

## 7. 查询列表和切换回显

使用 ChatSurface 时，切换回显的最小流程是：

```text
session.list()
      ↓
用户点击某个 session.id
      ↓
selectedSessionID 更新
      ↓
ChatSurface(sessionID={selectedSessionID})
      ↓
自动读取 state + messages，并订阅 events
```

如果页面自己渲染消息，则需要分别调用 `state({ sessionID })`、`messages({ sessionID })` 和 `events({ sessionID }, { afterSequence })`。`state`、历史和事件是三个不同的读取模型，不能只靠 `list()` 的 Session 元数据回显聊天内容。

## 8. Continue、Cancel 与失败处理

- `canContinue` 只有在最后一条 canonical 消息是非空 `user` 或 `tool` 消息时才为真。
- Continue 是实验性操作；Session 正在运行时返回 `NEXUM_SESSION_RUN_CONFLICT`，没有可恢复上下文时返回 `NEXUM_SESSION_NOT_CONTINUABLE`。
- Cancel 会中止活动 Coding Loop、取消待处理权限，并将仍处于 `idle` 或 `running` 的 Session 置为 `cancelled`。
- 已完成或已失败的 Session 不会因为普通 Cancel 被伪造为取消；调用方应以最终状态和事件为准。
- 重启后文件 Store 会把遗留的 `running` Session 恢复为 `idle`，避免把进程死亡误认为仍有活动运行；事件和 canonical history 仍可按各自 Store 的持久化能力恢复。

## 9. 相关入口

- [事件与 SSE 能力](events.md)
- [Runtime 运行流程](../architecture/runtime-flow.md)
- [UI 状态与恢复](../ui/states.md)
- [完整前后端案例](../examples/full-stack-chat.md)
- [Client Session 方法](../modules/nexum-client.md#session-方法参数)
- [ChatSurface 参数](../modules/nexum-chat-surface.md#chatsurface-参数)
- [Nexum HTTP API](../../apis/nexum.md)
- [Session Core 测试](../../packages/nexum-core/test/session.test.ts)
- [Server Session/历史测试](../../packages/nexum-server/test/server.test.ts)
