# 案例：SQLite + HTTP/SSE 服务

[English](../../examples/sqlite-http-runtime.md)

## 适合谁

如果 Runtime 要被 Web、桌面端、CLI 或其他语言调用，建议把运行时和 UI 分开：Server 负责 HTTP/SSE，Client 负责调用协议，SQLite 负责持久化。

## 组合关系

```text
Web / Desktop / CLI / 其他语言
             │
       Protocol + Client
             │ HTTP/SSE
           Server
             │
 Application + Core + SQLite Persistence
```

涉及的公开模块：[Application](../modules/nexum-application.md)、[SQLite Persistence](../modules/nexum-persistence-sqlite.md)、[Server](../modules/nexum-server.md)、[Protocol](../modules/nexum-protocol.md) 和 [Client](../modules/nexum-client.md)。

## 服务端组合

```ts
import { createSqliteRuntime } from "nexum/application"
import { startNexumServer } from "nexum/server"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("你是一个可靠的企业内部助手，不编造执行结果。")

const server = await startNexumServer({
  runtime,
  hostname: "127.0.0.1",
  port: 4097,
})

console.log(server.url)
```

`runtime` 负责 Session 和 Agent 执行；`server` 只负责路由、JSON 响应、SSE 事件和错误边界。部署到非回环地址时，还需要配置认证和安全策略，详见 [Server API](../modules/nexum-server.md#公开-api)。

## 客户端组合

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({
  baseUrl: "http://127.0.0.1:4097",
})

const session = await client.experimental.nexum.session.create({
  directory: "/workspace/demo",
  name: "demo",
})

await client.experimental.nexum.session.prompt({
  sessionID: session.id,
  text: "总结这个项目的结构",
})

for await (const event of client.experimental.nexum.session.events({
  sessionID: session.id,
})) {
  console.log(event.type, event.data)
}
```

## 关键参数

| 参数            | 传给谁                  | 说明                          |
| --------------- | ----------------------- | ----------------------------- |
| `databasePath`  | `createSqliteRuntime`   | SQLite 数据库文件位置         |
| `baseUrl`       | `Nexum.make`            | Server 地址，不是模型服务地址 |
| `directory`     | `session.create`        | Agent 的工作目录              |
| `sessionID`     | `session.prompt/events` | 当前 Session 的标识           |
| `text`          | `session.prompt`        | 用户本次任务                  |
| `afterSequence` | `session.events`        | 断线后从哪个事件序号继续接收  |

## 相关协议

- [Session 会话协议](../capabilities/session.md)
- [事件与 SSE](../capabilities/events.md)
- [完整 Runtime API](../../../apis/zh-CN/nexum.md)
- [Protocol API](../modules/nexum-protocol.md#公开-api)
