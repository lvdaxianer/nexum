# 案例：本地文件持久化

[English](../../examples/local-file-runtime.md)

## 适合谁

如果你要做本地 CLI、桌面端或单机应用，并希望 Session、消息、事件和角色配置在进程重启后继续存在，可以使用文件 Persistence。

## 组合关系

```text
本地应用
  └─ nexum-ai/application
       ├─ nexum-ai/persistence/file
       ├─ nexum-ai/core
       └─ ModelPort
```

涉及的公开模块：[Application](../modules/nexum-application.md)、[File Persistence](../modules/nexum-persistence-file.md)、[Core](../modules/nexum-core.md) 和 [Integrations](../modules/nexum-integrations.md)。

## 完整示例

```ts
import { createLocalRuntime } from "nexum-ai/application"

const runtime = createLocalRuntime({
  dataDirectory: ".nexum",
})

await runtime.modelConfig.update({
  baseUrl: "https://api.example.com/v1",
  model: "example-model",
  credentialRef: "MODEL_API_KEY",
})

await runtime.rolePrompt.update("你是一个长期协作的项目助手。先理解项目上下文，再执行用户任务。")

const session = await runtime.sessionService.create({
  directory: process.cwd(),
  name: "local-project",
})

await runtime.codingLoop.run({
  sessionID: session.sessionID,
  text: "记录这个项目当前最重要的三个问题",
})

const sessions = await runtime.sessionService.list()
console.log(sessions)

await runtime.close()
```

## 参数说明

| 参数            | 说明                                                       |
| --------------- | ---------------------------------------------------------- |
| `dataDirectory` | Persistence 数据目录，保存 Session、消息、事件、交互和配置 |
| `directory`     | Agent 工作目录，和 Persistence 数据目录不是同一个概念      |
| `rolePrompt`    | Runtime 默认角色，保存在 Persistence 中并在模型调用前注入  |
| `text`          | 当前 Session 的用户任务；历史消息由 Nexum 自动读取         |

## 文件 Persistence 保存什么

文件实现会分别保存 Session、消息、事件、交互、模型配置、角色提示词、权限策略、Skill 注册和 Memory。数据目录应该放在应用数据目录中，不要把敏感凭据提交到版本库。

## 相关文档

- [File Persistence API](../modules/nexum-persistence-file.md#公开-api)
- [Session 会话能力](../capabilities/session.md)
- [Context 与 History](../capabilities/context-and-history.md)
