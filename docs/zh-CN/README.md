# Nexum 文档中心

[English](../../README.md)

这里是 Nexum 的唯一文档入口。你不需要先了解源码或模块内部实现，先按自己的目标选择一条路径即可。

## 新手入门

第一次使用 Nexum，建议按这个顺序阅读：

1. [Nexum 是什么](../../README.zh-CN.md#nexum-解决什么问题)
2. [Nexum 能做什么](../../README.zh-CN.md#能做什么)
3. [第一个 Runtime](../../README.zh-CN.md#怎么组合)
4. [模块怎么划分](../../README.zh-CN.md#模块怎么划分)
5. [Session 会话使用指南](capabilities/session.md)

先记住五个概念：Runtime 是 Agent 的运行环境，Model 是模型，Tool 是 Agent 可以调用的能力，Session 是一次可恢复的任务，Surface 是用户看到的 Web、CLI 或桌面界面。

## 组合案例

不要从模块表开始拼 Runtime，先选择一个完整案例：[Nexum 组合案例](examples/README.md)。

- [手把手构建一个完整 Agent 应用](examples/full-stack-chat.md)：面向第一次使用 Nexum 的开发者，从 SQLite 后端、HTTP/SSE Server 到 Client 和 Chat Surface 一步完成接入。
- [在应用内嵌入 Agent](examples/embedded-runtime.md)：最简单的进程内组合。
- [本地文件持久化](examples/local-file-runtime.md)：保存 Session，重启后继续使用。
- [SQLite + HTTP/SSE 服务](examples/sqlite-http-runtime.md)：让 Web、桌面端或其他语言接入。
- [接入聊天 UI](examples/chat-surface.md)：把已有 Server 接入可嵌入的聊天界面。

## 按能力使用

| 你想了解什么         | 从这里开始                                                | 你会看到什么                                     |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| 创建、查询和恢复会话 | [Session 会话](capabilities/session.md)                   | 创建、列表、状态、Prompt、历史、继续、取消和删除 |
| 监听运行过程         | [事件与 SSE](capabilities/events.md)                      | 事件类型、sequence、断线恢复和终态               |
| 配置角色和模型       | [Model / Runtime](capabilities/model-runtime.md)          | 模型配置、角色提示词、Runtime 组合和能力探测     |
| 处理工具授权         | [Permission](ui/permission.md)                            | pending 请求、策略和用户决定                     |
| 处理 Agent 反问      | [Question](ui/question.md)                                | 结构化问题、选项、回答和取消                     |
| 接入 Skill           | [Skill 能力](capabilities/skills.md)                      | Skill 发现、注册、激活和权限                     |
| 接入 MCP             | [MCP 能力](capabilities/mcp.md)                           | Server、工具、资源、Prompt 和授权                |
| 了解上下文和历史     | [Context 与 History](capabilities/context-and-history.md) | 项目上下文、消息历史、压缩和恢复                 |
| 开发自己的 UI        | [UI 交互协议](ui/interaction-protocol.md)                 | Client、状态投影、交互和恢复流程                 |
| 适配样式与主题       | [样式与主题适配](ui/theming.md)                           | 响应式断点、明暗主题、变量覆盖和验证方式         |

## API 参数查询

模块文档中的“公开 API”章节用于查询导入路径、参数、返回值和最小示例：

| 模块            | 公开导入路径                                                                                          | API 文档                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Application     | `nexum/application`                                                                                   | [Application API](modules/nexum-application.md#公开-api)         |
| Core            | `nexum/core`                                                                                          | [Core API](modules/nexum-core.md#公开-api)                       |
| Persistence     | `nexum/persistence`、`nexum/persistence/memory`、`nexum/persistence/file`、`nexum/persistence/sqlite` | [Persistence API](modules/nexum-persistence.md#公开-api)         |
| Integrations    | `nexum/integrations`                                                                                  | [Integrations API](modules/nexum-integrations.md#公开-api)       |
| Protocol        | `nexum/protocol`                                                                                      | [Protocol API](modules/nexum-protocol.md#公开-api)               |
| Client          | `nexum/client`                                                                                        | [Client API](modules/nexum-client.md#公开-api)                   |
| Server          | `nexum/server`                                                                                        | [Server API](modules/nexum-server.md#公开-api)                   |
| Surface Adapter | `nexum/surface-adapter`                                                                               | [Surface Adapter API](modules/nexum-surface-adapter.md#公开-api) |
| Chat Surface    | `nexum/chat-surface`                                                                                  | [Chat Surface API](modules/nexum-chat-surface.md#公开-api)       |
| CLI             | `nexum/cli`                                                                                           | [CLI API](modules/nexum-cli.md#公开-api)                         |

每个 API 参数都应该说明：类型、是否必填、用途、默认值、数据来源、返回值和常见错误。用户安装的是唯一公共包 `nexum`；文档中的 `@nexum/*` 只表示仓库内部源码包，不是独立安装命令。

## HTTP / SSE 协议

需要从其他语言、Web 前端或自定义客户端接入时，查看 [Nexum Runtime API](../../apis/zh-CN/nexum.md)。这里记录完整的 HTTP 方法、URL、请求参数、响应结构、错误码、认证和 SSE 事件。

## 模块选择

| 你的目标                      | 推荐入口                                            |
| ----------------------------- | --------------------------------------------------- |
| 只想在自己的程序里嵌入 Agent  | `nexum/application` + `createEmbeddedRuntime`       |
| 需要本地保存 Session          | `nexum/application` + `createLocalRuntime`          |
| 需要 SQLite 和重启恢复        | `nexum/application` + `createSqliteRuntime`         |
| 想提供 HTTP/SSE 服务          | `nexum/server`                                      |
| 想从 Web 或桌面端调用 Runtime | `nexum/client`                                      |
| 想替换模型                    | `nexum/core` 的 `ModelPort` + `nexum/integrations`  |
| 想接入自己的存储              | `nexum/persistence` 的 Store Port                   |
| 想换 UI                       | `nexum/protocol` + `nexum/client` + Surface Adapter |

## 深入架构

- [模块边界](architecture/module-boundaries.md)：每个模块负责什么，以及依赖方向。
- [Runtime 运行流程](architecture/runtime-flow.md)：Prompt 如何进入 Session 并经过 Coding Loop。
- [模块文档索引](modules/README.md)：所有模块的职责、公开入口和使用文档。
- [UI 状态与恢复](ui/states.md)：UI 如何根据状态、历史和事件恢复页面。

## 文档约定

文档分为三种层次：

- 能力文档解释“它是什么、什么时候使用、数据如何流动”；
- 模块文档解释“从哪里导入、参数是什么、如何组合”；
- API 文档解释“HTTP/SSE 请求、响应和错误契约”。

如果只想开始使用，从本页的“新手入门”开始；如果已经知道要调用哪个方法，直接进入“API 参数查询”；如果要做跨语言或自定义 UI 集成，进入 HTTP/SSE 协议。
