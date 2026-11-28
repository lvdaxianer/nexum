# Nexum

[English](README.md)

Nexum 是一个 UI 无关、协议优先、可组合的 Agent Runtime。它把 Agent 的运行语义、环境实现、应用编排、网络协议和交互 Surface 拆成清晰的模块，让同一套 Agent 能力可以被 Web、Desktop、TUI、CLI 或企业内部应用复用。

Nexum 不是绑定某个 UI 的完整聊天产品，也不是把所有能力塞进一个“大 Agent 类”。它提供可运行的默认组合，同时允许替换模型、存储、Host、MCP、协议客户端和 UI。

## 为什么叫 Nexum

`Nexum` 取自“连接、绑定”的含义：它连接 Agent 的运行语义、环境能力、协议和不同交互 Surface。名字只叫 Nexum，因为核心价值不是某一个 UI 或某一类 Agent，而是让这些模块可以被清晰组合、替换和复用。

## 发布包安装

Nexum 对用户只发布一个 `nexum-ai` 包，不发布独立的 application、core 或 client 包。安装编译后的产物后，通过 subpath 使用模块：

```bash
npm install nexum-ai
```

```ts
import { createLocalRuntime } from "nexum-ai/application"
import { Nexum } from "nexum-ai/client"
import { createFilePersistence } from "nexum-ai/persistence/file"
```

完整入口和每个模块的使用说明见[模块文档索引](docs/zh-CN/modules/README.md)。

## 手把手构建一个完整 Agent 应用

如果你是第一次使用 Nexum，建议先完成这个案例：后端使用 SQLite 保存数据，Server 提供 HTTP/SSE，前端使用 Nexum 的 Client、Surface Adapter 和 Chat Surface 展示聊天界面。

完整案例见[手把手构建一个完整 Agent 应用](docs/zh-CN/examples/full-stack-chat.md)。教程会从 SQLite 后端开始，逐步讲解 Server、Client 和 Chat Surface；Session 的查询、切换、历史、重命名、删除、取消和继续统一见 [Session 会话能力](docs/zh-CN/capabilities/session.md)。

## Nexum 解决什么问题

一个 Agent 应用通常同时包含几类变化速度不同的内容：

- Coding Loop、Session、上下文压缩、权限和 Skill 调用等运行语义；
- 模型、文件系统、Shell、数据库、事件总线和 MCP 等环境能力；
- HTTP、SSE、进程内调用等传输边界；
- Web、Desktop、TUI、CLI 或业务系统等交互呈现。

如果这些内容全部放在同一层，替换一个 UI 会牵动 Agent Loop，替换存储会影响协议，测试也只能依赖完整应用启动。Nexum 的做法是把它们拆成可以独立理解、测试和替换的组合单元：Core 负责语义，Persistence/Integrations 负责环境，Application 负责编排，Protocol/Client/Server 负责外部边界，Surface 负责呈现。

## 能做什么

Nexum 当前提供以下运行时能力：

- **Coding Loop**：模型流式输出、工具调用、工具结果、续跑和终态收敛；
- **Session**：创建、恢复、更新、取消、继续和并发运行边界；
- **Prompt admission**：输入先进入可恢复的会话队列，再由执行器推进；
- **Tool 与 Host**：文件读写、Shell 等宿主能力，以及工作目录和超时边界；
- **Permission**：`allow_once`、`allow_always`、`deny` 和 Session 隔离；
- **Question**：结构化反问、答案提交、取消和安全暂停；
- **Context 与 History**：项目上下文、消息历史、上下文预算、压缩和恢复；
- **Skill**：Skill 发现、注册、校验、调用和更新事件；
- **Model**：OpenAI-compatible Model、模型配置、能力探测和 Provider Catalog；
- **MCP**：MCP Server 注册、工具/资源/Prompt 发现、调用和 OAuth 控制；
- **Memory**：可替换的 Memory Port 和默认 Persistence 实现；
- **Event 与 Protocol**：JSON Envelope、能力发现、事件序列、SSE 和稳定错误；
- **持久化与恢复**：Session、消息、交互、事件、权限和执行状态可保存并在重启后恢复。

这些能力可以用于编码 Agent、企业内部助手、自动化工作台、长任务执行器、终端 Agent 或嵌入式聊天组件。UI 不需要复制这些状态机，只需要消费 Protocol/Client 暴露的状态和事件。

## 怎么组合

Application 提供默认 Runtime Composer。不要从零开始拼接所有模块，先从[组合案例目录](docs/zh-CN/examples/README.md)选择一种部署形态，再按需要替换 Model、Persistence、Host 或其他 Port。

| 组合案例                                                  | 主要模块                                                                                               | 适合场景                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| [进程内嵌入 Agent](docs/zh-CN/examples/embedded-runtime.md)     | `nexum-ai/application` + `nexum-ai/core` + Memory Persistence                                                | 在自己的程序里直接调用 Agent |
| [本地文件 Runtime](docs/zh-CN/examples/local-file-runtime.md)   | `nexum-ai/application` + File Persistence                                                                 | CLI、桌面端和单机应用        |
| [SQLite + HTTP/SSE](docs/zh-CN/examples/sqlite-http-runtime.md) | Application + SQLite + [Server](docs/zh-CN/modules/nexum-server.md) + [Client](docs/zh-CN/modules/nexum-client.md) | Web、多端和跨语言接入        |
| [聊天 UI](docs/zh-CN/examples/chat-surface.md)                  | [Client](docs/zh-CN/modules/nexum-client.md) + [Protocol](docs/zh-CN/modules/nexum-protocol.md) + Chat Surface     | 快速嵌入聊天界面             |

每个案例都会解释代码中的参数、数据如何流动，以及下一步应该查哪个模块或协议文档。

## 模块怎么划分

### 运行时边界

```text
┌──────────────────────────────────────────────────────────────┐
│ Surface：Web · Chat · CLI · Desktop · TUI · 企业应用          │
│ 负责布局、交互和状态投影                                      │
└──────────────────────────────┬───────────────────────────────┘
                               │ Client / Surface Adapter
┌──────────────────────────────▼───────────────────────────────┐
│ Protocol / Transport：Protocol · Client · Server              │
│ 负责版本化契约、Envelope、错误、事件和 HTTP/SSE              │
└──────────────────────────────┬───────────────────────────────┘
                               │ Runtime 注入
┌──────────────────────────────▼───────────────────────────────┐
│ Application：Runtime Composer、Skill、Tool、Question 编排     │
└───────────────┬──────────────────────────────┬────────────────┘
                │                              │
┌───────────────▼──────────────┐  ┌────────────▼────────────────┐
│ Core：运行语义和 Port          │  │ Environment：Persistence     │
│ Loop · Session · Permission    │  │ · Integrations               │
│ Context · Skill · Memory       │  │ 文件/内存/SQLite/Model/Host  │
└───────────────────────────────┘  └─────────────────────────────┘
```

### 包职责

| 包                                                                     | 所在边界     | 负责什么                                                                                            | 典型选择                       |
| ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| [`nexum-ai/core`](docs/zh-CN/modules/nexum-core.md)                             | 运行时基础   | Coding Loop、Session、Permission、Question、Context、Skill、Memory/Host/Model/Store Port 和领域错误 | 所有 Runtime 的核心            |
| [`nexum-ai/persistence`](docs/zh-CN/modules/nexum-persistence.md)               | 持久化契约   | `NexumPersistence`、Store 组合契约和事件 Hub Port，不包含具体存储                                   | 自定义持久化实现的公共边界     |
| [`nexum-ai/persistence/memory`](docs/zh-CN/modules/nexum-persistence-memory.md) | 持久化实现   | 进程内内存 Store，不创建文件或数据库                                                                | 嵌入式运行、快速测试           |
| [`nexum-ai/persistence/file`](docs/zh-CN/modules/nexum-persistence-file.md)     | 持久化实现   | 本地 JSON 文件 Store，支持数据目录和原子写入                                                        | CLI、本地单机运行              |
| [`nexum-ai/persistence/sqlite`](docs/zh-CN/modules/nexum-persistence-sqlite.md) | 持久化实现   | SQLite Store、Schema 初始化、事务和重启恢复                                                         | Web/Server、真实持久化测试     |
| [`nexum-ai/integrations`](docs/zh-CN/modules/nexum-integrations.md)             | 外部集成     | OpenAI-compatible Model、本地 Host、目录校验、项目上下文、Skill 文件来源和 MCP                      | 替换模型、执行环境或 MCP SDK   |
| [`nexum-ai/application`](docs/zh-CN/modules/nexum-application.md)               | 应用编排     | Skill Registry、Tool Registry、Question Broker、Configured Coding Loop 和 Runtime Composer          | 创建完整 Runtime               |
| [`nexum-ai/protocol`](docs/zh-CN/modules/nexum-protocol.md)                     | 协议模型     | `nexum.runtime.v1`、JSON Envelope、能力、Session、交互和事件模型                                    | 实现其他语言或传输绑定         |
| [`nexum-ai/client`](docs/zh-CN/modules/nexum-client.md)                         | 协议消费     | HTTP 请求、响应校验、错误归一化和 SSE 消费                                                          | Web、CLI、桌面端和自定义客户端 |
| [`nexum-ai/server`](docs/zh-CN/modules/nexum-server.md)                         | 协议绑定     | 将已组合 Runtime 暴露为 HTTP/SSE，负责路由、错误边界和事件投递                                      | 独立本地服务或应用后端         |
| [`nexum-ai/surface-adapter`](docs/zh-CN/modules/nexum-surface-adapter.md)       | Surface 适配 | `ChatProtocolAdapter`、聊天操作和协议错误归一化                                                     | 复用聊天协议接入不同 UI        |
| [`nexum-ai/chat-surface`](docs/zh-CN/modules/nexum-chat-surface.md)             | UI 组件      | 可嵌入聊天组件、聊天交互和 Web Component                                                            | 在应用内嵌入聊天体验           |
| `nexum-test`                                                                       | 内部 Demo    | 完整演示工作台，并通过 `import` 引入 `ChatSurface`                                          | 仓库内验证，不作为生产依赖     |
| `nexum-ai/cli`                                                            | 终端 Surface | REPL、思考动画、交互问答和管理面命令                                                                | 终端 Agent                     |
| 仓库内部验证组合                                                       | 验证组合     | Server、Runtime、Client 和 Surface 的跨层 POC 与持久化恢复验证                                      | Test Workbench，不作为生产依赖 |

Persistence 实现的细节见 [`nexum-ai/persistence/memory`](docs/zh-CN/modules/nexum-persistence-memory.md)、[`nexum-ai/persistence/file`](docs/zh-CN/modules/nexum-persistence-file.md) 和 [`nexum-ai/persistence/sqlite`](docs/zh-CN/modules/nexum-persistence-sqlite.md)。每个主要模块的实现边界见[模块文档索引](docs/zh-CN/modules/README.md)。

### 依赖方向

```text
nexum-ai/persistence/* ──> nexum-ai/persistence ──> nexum-ai/core
nexum-ai/integrations ─────────────────────────> nexum-ai/core
nexum-ai/application ──> nexum-ai/core + persistence/* + integrations
nexum-ai/protocol       纯协议模型，不依赖 Runtime 实现
nexum-ai/client ───────> nexum-ai/protocol
nexum-ai/server ───────> nexum-ai/core + nexum-ai/application + nexum-ai/protocol
nexum-ai/surface-adapter ──> nexum-ai/client
nexum-ai/chat-surface ─────> nexum-ai/surface-adapter
nexum-ai/cli ──────────────> nexum-ai/surface-adapter + nexum-ai/client
Test Workbench ────────> Application + Server + Client + Core
```

依赖方向的核心原则是：Core 不导入实现包；Persistence 和 Integrations 通过 Port 实现环境能力；Application 负责组合；Client 不依赖 Core 或 Server；Surface 不复制 Agent Loop。

## 什么时候替换哪个模块

| 需求                                  | 组合建议                                                            |
| ------------------------------------- | ------------------------------------------------------------------- |
| 只想测试 Coding Loop 或嵌入一个 Agent | [进程内嵌入 Agent](docs/zh-CN/examples/embedded-runtime.md)               |
| 需要本地 CLI 和可查看的运行状态       | [本地文件 Runtime](docs/zh-CN/examples/local-file-runtime.md)             |
| 需要服务重启后恢复 Session 和事件     | [SQLite + HTTP/SSE](docs/zh-CN/examples/sqlite-http-runtime.md)           |
| 使用企业模型网关                      | 注入自己的 `ModelPort` 或 Provider Catalog                          |
| 限制文件和 Shell 能力                 | 注入自己的 `HostPort`/Sandbox，并保留 Core Permission               |
| 使用远程数据库或事件总线              | 实现 `nexum-ai/persistence` 的 Store/Event Port                        |
| 换成另一种 UI                         | [接入聊天 UI](docs/zh-CN/examples/chat-surface.md) 或复用 Protocol/Client |

适配器只负责把 Core Port 接到外部技术。Permission Policy 是 Core 的领域策略；Skill Registry、Tool Registry 和 Question Broker 是 Application 服务，不应被误认为 Persistence 或 Integrations 的实现细节。

## 事件和交互模型

Core 产生运行事实，Protocol 表达事实，Surface 决定呈现：

| 运行事实         | 协议事件                             | Surface 表现           |
| ---------------- | ------------------------------------ | ---------------------- |
| 模型产生文本     | `assistant.text`                     | 流式文本消息           |
| 模型请求工具     | `tool.request`                       | 工具调用卡片           |
| 工具返回结果     | `tool.result`                        | 执行结果或折叠详情     |
| 需要用户授权     | `permission.requested`               | 权限确认卡片           |
| 需要用户补充信息 | `question.request`                   | 反问卡片，暂停后续工具 |
| 上下文正在压缩   | `context.compaction.*`               | 上下文状态条           |
| Skill 被激活     | `skill.activated`                    | Skill 活动卡片         |
| Session 到达终态 | `session.completed/failed/cancelled` | 完成、失败或取消状态   |

长任务的输入、事件序列、权限等待、Question 暂停、上下文压缩和终态都可以通过协议观察和恢复。详细生命周期见[Session 文档](docs/zh-CN/capabilities/session.md)、[事件文档](docs/zh-CN/capabilities/events.md)、[Question 协议](docs/zh-CN/ui/question.md)和[Permission 协议](docs/zh-CN/ui/permission.md)。

## 文档

从 [Nexum 文档中心](docs/zh-CN/README.md) 开始。文档中心按新手入门、Session/事件等运行能力、模块 API 参数、HTTP/SSE 协议和架构说明组织内容。

如果你已经知道要调用哪个模块，也可以直接查看[模块文档索引](docs/zh-CN/modules/README.md)；如果要做跨语言或自定义 UI 集成，查看[完整 Runtime API](apis/zh-CN/nexum.md)；如果在做 Web 界面的响应式布局或明暗主题适配，查看[样式与主题适配](docs/zh-CN/ui/theming.md)。

## 项目状态

当前仓库已经具备可独立组合的 Core、Persistence、Integrations、Application、Protocol、Server、Client 和 Surface；Test Workbench、文件持久化、SQLite 持久化、HTTP/SSE、CLI、权限、Question、Skill、MCP 和执行恢复均有对应实现或验证入口。Nexum 仍处于持续演进阶段，新增能力优先通过 Port、Protocol 和可替换模块接入，避免把宿主 UI 或具体供应商绑定进 Core。

## License

MIT
