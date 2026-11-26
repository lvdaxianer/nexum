# `nexum/client`

源码模块：`@nexum/client`。用户安装唯一公共包 `nexum` 后，从 `nexum/client` 导入。

状态：现状基线

权威来源：[`packages/nexum-client/src/index.ts`](../../packages/nexum-client/src/index.ts)、[`packages/nexum-client/README.md`](../../packages/nexum-client/README.md)

最后核对：2026-11-24

## 职责

`@nexum/client` 是 Nexum HTTP/SSE 协议的 TypeScript 客户端。它负责 URL 拼接、请求头、JSON Envelope 解包、协议版本校验、稳定错误转换和 SSE 事件解析；不负责 Session 业务规则、权限策略或 UI 渲染。

## 公开 API

入口 [`src/index.ts`](../../packages/nexum-client/src/index.ts) 导出 `Nexum`、`NexumClientError`、`NexumFetch`、`NexumClientOptions`、`NexumEventOptions`，并重新导出协议类型。

### `Nexum.make(options)`

| 参数      | 类型         | 必填 | 说明                                     | 默认值                  |
| --------- | ------------ | ---- | ---------------------------------------- | ----------------------- |
| `baseUrl` | `string`     | 否   | Server 的基础地址，不要包含 `/api/nexum` | `http://127.0.0.1:4097` |
| `fetch`   | `NexumFetch` | 否   | 自定义请求实现，适合 SSR、测试或宿主注入 | `globalThis.fetch`      |

返回一个 Client 对象。业务方法都位于 `client.experimental.nexum` 下；其中 `session` 负责会话，`rolePrompt` 负责 Runtime 级角色提示词，`model` 负责模型配置，`permissionPolicy` 负责权限策略，`skill` 负责 Skill 管理。

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({
  baseUrl: "http://127.0.0.1:4097",
})

const capabilities = await client.capabilities()
const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "Demo",
})
```

不传 `baseUrl` 时默认连接 `http://127.0.0.1:4097`。可通过 `fetch` 注入自定义传输实现，以便在测试、服务端渲染或宿主运行时中复用客户端。

### Session 方法参数

| 方法                             | 必填参数            | 可选参数                        | 说明                                                     |
| -------------------------------- | ------------------- | ------------------------------- | -------------------------------------------------------- |
| `session.create(input)`          | `directory`         | `name`                          | 创建并返回 Session，`directory` 必须是可用的绝对工作目录 |
| `session.list()`                 | 无                  | 无                              | 查询当前 Server 中的 Session                             |
| `session.state(input)`           | `sessionID`         | 无                              | 获取状态、pending Permission/Question 和 `lastSequence`  |
| `session.messages(input)`        | `sessionID`         | `before`、`limit`、`snapshotID` | 分页查询历史；实验性接口                                 |
| `session.prompt(input)`          | `sessionID`、`text` | 无                              | 提交用户任务；角色提示词不放在这里                       |
| `session.continue(input)`        | `sessionID`         | 无                              | 继续可恢复的上下文；实验性接口                           |
| `session.cancel(input)`          | `sessionID`         | 无                              | 取消当前运行                                             |
| `session.events(input, options)` | `sessionID`         | `afterSequence`、`signal`       | 订阅 SSE 事件                                            |

`session.id` 是 `create()` 和 `list()` 返回的字段；Client 方法的输入字段叫 `sessionID`，调用方需要显式传入它。`session.prompt({ text })` 的 `text` 是用户本轮输入，默认角色提示词通过 `client.experimental.nexum.rolePrompt.update({ prompt })` 单独配置。

### Role Prompt 方法

| 方法                            | 参数          | 说明                          |
| ------------------------------- | ------------- | ----------------------------- |
| `rolePrompt.get()`              | 无            | 获取当前角色提示词和来源      |
| `rolePrompt.update({ prompt })` | `prompt` 必填 | 更新 Runtime 级默认角色提示词 |
| `rolePrompt.reset()`            | 无            | 恢复默认角色提示词            |

## 方法分组

| 分组              | 方法                                                               | 作用                                                                       |
| ----------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 根能力            | `capabilities()`                                                   | 获取 Server 当前能力、事件和交互支持情况                                   |
| Model             | `experimental.nexum.model.get/update/probe()`                      | 读取、更新和探测模型配置                                                   |
| Role Prompt       | `experimental.nexum.rolePrompt.get/update/reset()`                 | 读取、更新和重置角色提示                                                   |
| Session           | `create/list/state/messages/update/delete()`                       | 管理 Session、状态和消息历史                                               |
| 运行控制          | `session.prompt/continue/cancel()`                                 | 发送消息、恢复运行、取消当前运行                                           |
| 事件              | `session.events()`                                                 | 订阅指定 Session 的 SSE 事件，可传 `AbortSignal`、`afterSequence` 和请求头 |
| Permission        | `session.permission.list/reply()`                                  | 查询待处理权限并提交决定                                                   |
| Permission Policy | `experimental.nexum.permissionPolicy.list/create/update/remove()`  | 查询和管理全局或 Session 级权限策略规则                                    |
| Question          | `session.question.list/reply/cancel()`                             | 查询问题、提交答案或取消问题                                               |
| Skill             | `session.skill.list/detail/register/refresh/validate/unregister()` | 发现、校验和管理 Skill                                                     |

具体 URL、请求字段和响应状态见 [`apis/nexum.md`](../../apis/nexum.md)。

## 请求与错误行为

JSON 请求默认发送 `Accept: application/json` 和 `Content-Type: application/json`。客户端校验响应 Envelope 的 `meta.protocolVersion`；服务端错误或协议不匹配会转换为 `NexumClientError`，其中包含 `status`、稳定 `code`、`message`，可选 `traceId`。

SSE 请求使用 `Accept: text/event-stream`。客户端解析 `data:` 行并返回 `NexumEvent`；空响应体会产生 `NEXUM_EVENT_STREAM_EMPTY`。订阅生命周期由调用方通过 `AbortSignal` 控制，事件去重和 UI 投影由 ChatSurface 或宿主负责。

```ts
const controller = new AbortController()

try {
  for await (const event of client.experimental.nexum.session.events(session.id, {
    signal: controller.signal,
    afterSequence: 0,
  })) {
    console.log(event.sequence, event.type)
  }
} catch (error) {
  if (error instanceof Error) console.error(error.message)
}
```

## 依赖边界

Client 运行时只依赖 [`@nexum/protocol`](./nexum-protocol.md)，不能依赖 Core、Application、Server 或 UI。它是浏览器、Node/Bun 和 ChatSurface 之间的协议适配层。

## 能力映射

- HTTP JSON：提供 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md) 中的请求/响应通道。
- SSE：提供 [`docs/capabilities/events.md`](../capabilities/events.md) 中的事件序列和恢复游标。
- Session：被 [`@nexum/chat-surface`](./nexum-chat-surface.md) 默认适配器使用。
- Skill/Permission/Question：把待处理项和用户回复映射到 API，不在客户端本地决定业务结果。

## 修改同步清单

- 增加或修改方法：同步 [`apis/nexum.md`](../../apis/nexum.md) 的路由表、请求示例和错误说明。
- 修改 Envelope/SSE 解析：同步 [`@nexum/protocol`](./nexum-protocol.md)、[`docs/capabilities/events.md`](../capabilities/events.md) 和 ChatSurface 适配器。
- 修改错误码或请求头：同步 [`docs/ui/states.md`](../ui/states.md) 的错误/恢复状态说明，并运行 Client 测试。
