# `@nexum/client`

状态：现状基线

权威来源：[`packages/nexum-client/src/index.ts`](../../packages/nexum-client/src/index.ts)、[`packages/nexum-client/README.md`](../../packages/nexum-client/README.md)

最后核对：2026-11-24

## 职责

`@nexum/client` 是 Nexum HTTP/SSE 协议的 TypeScript 客户端。它负责 URL 拼接、请求头、JSON Envelope 解包、协议版本校验、稳定错误转换和 SSE 事件解析；不负责 Session 业务规则、权限策略或 UI 渲染。

## 公开入口与接入

入口 [`src/index.ts`](../../packages/nexum-client/src/index.ts) 导出 `Nexum`、`NexumClientError`、`NexumFetch`、`NexumClientOptions`、`NexumEventOptions`，并重新导出协议类型。

```ts
import { Nexum } from "@nexum/client"

const client = Nexum.make({
  baseUrl: "http://127.0.0.1:4097",
})

const capabilities = await client.capabilities()
const session = await client.experimental.nexum.session.create({
  title: "Demo",
})
```

不传 `baseUrl` 时默认连接 `http://127.0.0.1:4097`。可通过 `fetch` 注入自定义传输实现，以便在测试、服务端渲染或宿主运行时中复用客户端。

## 方法分组

| 分组        | 方法                                                               | 作用                                                                       |
| ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 根能力      | `capabilities()`                                                   | 获取 Server 当前能力、事件和交互支持情况                                   |
| Model       | `experimental.nexum.model.get/update/probe()`                      | 读取、更新和探测模型配置                                                   |
| Role Prompt | `experimental.nexum.rolePrompt.get/update/reset()`                 | 读取、更新和重置角色提示                                                   |
| Session     | `create/list/state/messages/update/delete()`                       | 管理 Session、状态和消息历史                                               |
| 运行控制    | `session.prompt/continue/cancel()`                                 | 发送消息、恢复运行、取消当前运行                                           |
| 事件        | `session.events()`                                                 | 订阅指定 Session 的 SSE 事件，可传 `AbortSignal`、`afterSequence` 和请求头 |
| Permission  | `session.permission.list/reply()`                                  | 查询待处理权限并提交决定                                                   |
| Permission Policy | `experimental.nexum.permissionPolicy.list/create/update/remove()` | 查询和管理全局或 Session 级权限策略规则                            |
| Question    | `session.question.list/reply/cancel()`                             | 查询问题、提交答案或取消问题                                               |
| Skill       | `session.skill.list/detail/register/refresh/validate/unregister()` | 发现、校验和管理 Skill                                                     |

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

## 测试与验证

```sh
cd packages/nexum-client
bun test
bun run typecheck
```

测试位于 [`packages/nexum-client/test/client.test.ts`](../../packages/nexum-client/test/client.test.ts)，重点覆盖路由映射、Skill 调用和协议错误处理。

## 修改同步清单

- 增加或修改方法：同步 [`apis/nexum.md`](../../apis/nexum.md) 的路由表、请求示例和错误说明。
- 修改 Envelope/SSE 解析：同步 [`@nexum/protocol`](./nexum-protocol.md)、[`docs/capabilities/events.md`](../capabilities/events.md) 和 ChatSurface 适配器。
- 修改错误码或请求头：同步 [`docs/ui/states.md`](../ui/states.md) 的错误/恢复状态说明，并运行 Client 测试。
