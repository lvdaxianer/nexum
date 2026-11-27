# 案例：在应用内嵌入一个 Agent

[English](../../examples/embedded-runtime.md)

## 适合谁

如果你的程序已经有自己的 UI、路由或任务系统，只想在进程内调用 Agent，可以从这个组合开始。它不需要 HTTP Server，默认使用内存 Persistence。

## 组合关系

```text
你的应用
  └─ nexum-ai/application
       ├─ nexum-ai/core
       ├─ 内存 Persistence
       └─ ModelPort
```

涉及的公开模块：[Application](../modules/nexum-application.md)、[Core](../modules/nexum-core.md)、[Persistence](../modules/nexum-persistence-memory.md) 和 [Integrations](../modules/nexum-integrations.md)。

## 完整示例

```ts
import { createEmbeddedRuntime } from "nexum-ai/application"

const runtime = createEmbeddedRuntime()

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("你是一个专业的代码助手，回答要简洁并给出可执行建议。")

const session = await runtime.sessionService.create({
  directory: process.cwd(),
  name: "embedded-demo",
})

await runtime.codingLoop.run({
  sessionID: session.sessionID,
  text: "检查当前项目的目录结构并给出摘要",
})

await runtime.close()
```

## 参数说明

| 参数            | 说明                                                    |
| --------------- | ------------------------------------------------------- |
| `baseUrl`       | OpenAI-compatible 模型服务地址，不是 Nexum Server 地址  |
| `model`         | 上游模型名称                                            |
| `credentialRef` | 从运行环境读取凭据的变量名；也可以直接使用 `credential` |
| `rolePrompt`    | Runtime 级别的角色提示词，不需要每次提交任务时重复传入  |
| `directory`     | Agent 可以读写和执行操作的工作目录                      |
| `sessionID`     | `sessionService.create()` 返回的会话标识                |
| `text`          | 用户本次提交给 Agent 的任务                             |

## 什么时候换成其他案例

这个案例的 Session、消息和事件只存在于当前进程。需要重启后恢复时，改看[本地文件持久化](local-file-runtime.md)；需要 Web 或其他语言接入时，改看 [SQLite + HTTP/SSE 服务](sqlite-http-runtime.md)。

## 相关文档

- [Application API](../modules/nexum-application.md#公开-api)
- [Model / Runtime 能力](../capabilities/model-runtime.md)
- [Session API](../capabilities/session.md#session-api-查询)
