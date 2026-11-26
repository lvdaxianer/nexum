# `nexum/core`

源码模块：`@nexum/core`。用户安装唯一公共包 `nexum` 后，从 `nexum/core` 导入类型和端口。

状态：现状基线

权威来源：[`packages/nexum-core/src/index.ts`](../../packages/nexum-core/src/index.ts)、[`packages/nexum-core/README.md`](../../packages/nexum-core/README.md)

最后核对：2026-11-24

## 职责

`@nexum/core` 是 UI 无关的 Coding Agent 核心。它定义模型、工具、权限、Question、Session、Context、Memory、Skill、Runtime 等领域端口和业务规则，承载 Coding Loop、Function Calling、上下文压缩与恢复。

Core 不依赖 HTTP、具体 UI、文件格式或外部模型供应商。外层通过端口注入适配器，Server/Application 再把 Core 结果映射为 Protocol 和事件。

## 公开 API

入口 [`src/index.ts`](../../packages/nexum-core/src/index.ts) 导出或汇聚：

- Model：`ModelPort`、`ModelPrompt`、`ModelChunk`、`ModelToolCall`。
- Tools/Permission：`ToolPort`、`ToolRequest`、`ToolResult`、`PermissionPort`、`PermissionEffect`。
- Session：`SessionRecord`、`SessionStore`、`NexumSessionService` 及稳定错误类型。
- Runtime：Runtime、Memory、Host、MCP、Context 和 EventSink 端口。
- Skill/Role Prompt：Skill 注册、调用和角色提示存储契约。

实现文件按能力拆分在 [`src/model.ts`](../../packages/nexum-core/src/model.ts)、[`src/tools.ts`](../../packages/nexum-core/src/tools.ts)、[`src/permission.ts`](../../packages/nexum-core/src/permission.ts)、[`src/context.ts`](../../packages/nexum-core/src/context.ts)、[`src/runtime.ts`](../../packages/nexum-core/src/runtime.ts) 和 [`src/skill-registry.ts`](../../packages/nexum-core/src/skill-registry.ts)。

| API                                   | 关键参数                                               | 作用                                                  |
| ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `ModelPort.prompt(input)`             | `sessionID`、`text`、`messages`、`tools`、`signal`     | 向模型提交一次生成请求并返回异步增量                  |
| `NexumCodingLoop.run(input)`          | `sessionID`、`text`                                    | 执行一次用户任务，自动处理工具、权限、Question 和事件 |
| `NexumSessionService.create(input)`   | `directory`、`name?`                                   | 创建绑定工作目录的 Session                            |
| `ToolPort.execute(request)`           | `sessionID`、`toolName`、`action`、`resource`、`input` | 执行已通过权限判断的工具请求                          |
| `NexumRolePromptStore.update(prompt)` | `prompt`                                               | 更新 Runtime 级默认角色提示词                         |

`ModelPrompt.messages` 是模型可见的消息列表；一般由 Coding Loop 组合历史、角色提示词、Skill 和项目上下文，普通使用者不需要手动维护。用户本轮输入使用 `NexumCodingLoopInput.text`，不是角色提示词字段。

## 端口与运行边界

一次 Coding Loop 由 Model 产生增量；Core 根据增量决定输出文本、执行工具、请求 Permission/Question 或完成运行。工具只有在权限结果允许后才能执行；工作目录和 Session 隔离由 Host/Directory 端口配合校验。

| 端口                              | 责任                               | 典型适配器                                    |
| --------------------------------- | ---------------------------------- | --------------------------------------------- |
| `ModelPort`                       | 生成文本、推理和工具调用增量       | `@nexum/integrations` OpenAI-compatible Model |
| `ToolPort`                        | 执行已经通过权限判断的工具         | Application Tool Registry                     |
| `PermissionPort`                  | 返回 allow/deny/ask 并观察待审批项 | Application Permission Broker                 |
| `SessionStore`/`MessageStore`     | 保存 Session 与消息                | `@nexum/persistence`                          |
| `HostPort`/`MemoryPort`/`McpPort` | 文件、上下文记忆和 MCP 外部能力    | `@nexum/integrations` 或 Persistence          |

## 能力映射

- Session 状态和运行错误：[`docs/capabilities/session.md`](../capabilities/session.md)。
- Permission、Question、工具审批：[`docs/ui/permission.md`](../ui/permission.md)、[`docs/ui/question.md`](../ui/question.md)。
- 上下文预算和压缩：[`docs/capabilities/context-and-history.md`](../capabilities/context-and-history.md)。
- Model、Skill、Runtime：[`docs/capabilities/model-runtime.md`](../capabilities/model-runtime.md)、[`docs/capabilities/skills.md`](../capabilities/skills.md)。
- 对外 HTTP/SSE 映射：[`apis/nexum.md`](../../apis/nexum.md)。

## 依赖边界

Core 是领域层，不依赖 Persistence、Application、Server、Client 或任何 UI 包。Application 负责组合 Core 端口；Integrations 和 Persistence 分别提供外部系统与存储适配。

## 修改同步清单

- 修改端口或稳定错误码：同步 [`@nexum/protocol`](./nexum-protocol.md)、API 文档和 Application 适配器。
- 修改 Loop/Permission/Question/Context：同步对应能力/UI 文档和 Core 测试。
- 修改依赖方向：同步 [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md) 并运行边界测试。
