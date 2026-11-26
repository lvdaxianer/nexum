# Nexum

Nexum 是一个 UI 无关、协议优先、可组合的 Agent Runtime。它把 Agent 的运行语义、环境实现、应用编排、网络协议和交互 Surface 拆成清晰的模块，让同一套 Agent 能力可以被 Web、Desktop、TUI、CLI 或企业内部应用复用。

Nexum 不是绑定某个 UI 的完整聊天产品，也不是把所有能力塞进一个“大 Agent 类”。它提供可运行的默认组合，同时允许替换模型、存储、Host、MCP、协议客户端和 UI。

## 为什么叫 Nexum

`Nexum` 取自“连接、绑定”的含义：它连接 Agent 的运行语义、环境能力、协议和不同交互 Surface。名字只叫 Nexum，因为核心价值不是某一个 UI 或某一类 Agent，而是让这些模块可以被清晰组合、替换和复用。

## 发布包安装

Nexum 对用户只发布一个 `nexum` 包，不发布 `@nexum/application` 等独立包。安装编译后的产物后，通过 workspace 风格的 subpath 使用模块：

```bash
npm install nexum
```

```ts
import { createLocalRuntime } from "nexum/application"
import { Nexum } from "nexum/client"
import { createFilePersistence } from "nexum/persistence/file"
```

完整入口和每个模块的使用说明见[模块文档索引](docs/modules/README.md)。

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

Application 提供默认 Runtime Composer。你可以先使用默认组合，再按部署形态替换 Persistence、Model、Host 或其他 Port。

### 1. 进程内组合：嵌入和测试

`createEmbeddedRuntime` 默认使用内存 Persistence，不创建文件，适合单元测试、嵌入式宿主和一次性场景：

```ts
import { createEmbeddedRuntime } from "nexum/application"
import type { ModelPort } from "nexum/core"

declare const model: ModelPort

const runtime = createEmbeddedRuntime({ model })
const session = await runtime.sessionService.create({
  directory: process.cwd(),
  name: "embedded-demo",
})

await runtime.codingLoop.run({
  sessionID: session.sessionID,
  text: "检查当前项目的结构并给出摘要",
})
```

`model` 是调用方注入的 `ModelPort`；可以接入模型网关、测试模型或其他 OpenAI-compatible 实现。Core 不需要知道模型 SDK 的具体类型。

### 2. 本地持久化：文件 Runtime

`createLocalRuntime` 使用 `@nexum/persistence-file`，把 Session、消息、事件、交互和其他 Runtime 状态保存到数据目录，适合本地 CLI 或单机应用：

```ts
import { createLocalRuntime } from "nexum/application"

const runtime = createLocalRuntime({ dataDirectory: ".nexum" })
```

文件实现支持逐文件路径覆盖和原子写入。需要临时状态时使用 `@nexum/persistence-memory`；需要数据库事务和重启恢复时使用 SQLite。

### 3. SQLite + HTTP/SSE：服务形态

`createSqliteRuntime` 使用 `@nexum/persistence-sqlite`，再交给 Server 绑定 HTTP/SSE：

```ts
import { createSqliteRuntime } from "nexum/application"
import { startNexumServer } from "nexum/server"

const runtime = await createSqliteRuntime({
  databasePath: ".nexum/nexum.db",
})
const server = await startNexumServer({ runtime })

console.log(`Nexum listening at ${server.url}`)
```

Server 只负责传输、路由、错误映射和事件订阅；Runtime 的 Session、权限、工具和模型能力由注入的 Application/Core 组合提供。停止服务时调用 `await server.stop()`，需要时再关闭 Runtime。

### 4. 客户端和 Surface

协议客户端不依赖 Core 或 Server，可以被 Web、Desktop、TUI、CLI 或其他语言绑定复用：

```ts
import { Nexum } from "nexum/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
const capabilities = await client.capabilities()
```

聊天类 Surface 通常使用 `@nexum/surface-adapter` 的 `ChatProtocolAdapter`，再由 `@nexum/chat-surface` 或其他 UI 组件决定布局。Surface 应根据事件和状态展示权限、Question、工具和终态，不应通过猜测文本来判断运行时状态。

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

| 包                          | 所在边界     | 负责什么                                                                                            | 典型选择                       |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@nexum/core`               | 运行时基础   | Coding Loop、Session、Permission、Question、Context、Skill、Memory/Host/Model/Store Port 和领域错误 | 所有 Runtime 的核心            |
| `@nexum/persistence`        | 持久化契约   | `NexumPersistence`、Store 组合契约和事件 Hub Port，不包含具体存储                                   | 自定义持久化实现的公共边界     |
| `@nexum/persistence-memory` | 持久化实现   | 进程内内存 Store，不创建文件或数据库                                                                | 嵌入式运行、快速测试           |
| `@nexum/persistence-file`   | 持久化实现   | 本地 JSON 文件 Store，支持数据目录和原子写入                                                        | CLI、本地单机运行              |
| `@nexum/persistence-sqlite` | 持久化实现   | SQLite Store、Schema 初始化、事务和重启恢复                                                         | Web/Server、真实持久化测试     |
| `@nexum/integrations`       | 外部集成     | OpenAI-compatible Model、本地 Host、目录校验、项目上下文、Skill 文件来源和 MCP                      | 替换模型、执行环境或 MCP SDK   |
| `@nexum/application`        | 应用编排     | Skill Registry、Tool Registry、Question Broker、Configured Coding Loop 和 Runtime Composer          | 创建完整 Runtime               |
| `@nexum/protocol`           | 协议模型     | `nexum.runtime.v1`、JSON Envelope、能力、Session、交互和事件模型                                    | 实现其他语言或传输绑定         |
| `@nexum/client`             | 协议消费     | HTTP 请求、响应校验、错误归一化和 SSE 消费                                                          | Web、CLI、桌面端和自定义客户端 |
| `@nexum/server`             | 协议绑定     | 将已组合 Runtime 暴露为 HTTP/SSE，负责路由、错误边界和事件投递                                      | 独立本地服务或应用后端         |
| `@nexum/surface-adapter`    | Surface 适配 | `ChatProtocolAdapter`、聊天操作和协议错误归一化                                                     | 复用聊天协议接入不同 UI        |
| `@nexum/chat-surface`       | UI 组件      | 可嵌入聊天组件、聊天交互和 Web Component                                                            | 在应用内嵌入聊天体验           |
| `@nexum/surfaces`           | 参考 UI      | Web 参考 Surface，把协议事件投影成聊天、卡片、抽屉和状态视图                                        | 运行 Test Workbench 或参考实现 |
| `@nexum/cli`                | 终端 Surface | REPL、思考动画、交互问答和管理面命令                                                                | 终端 Agent                     |
| `@nexum/test`               | 验证组合     | Server、Runtime、Client 和 Surface 的跨层 POC 与持久化恢复验证                                      | Test Workbench，不作为生产依赖 |

Persistence 实现的细节见 [`@nexum/persistence-memory`](packages/nexum-persistence-memory/README.md)、[`@nexum/persistence-file`](packages/nexum-persistence-file/README.md) 和 [`@nexum/persistence-sqlite`](packages/nexum-persistence-sqlite/README.md)。每个主要模块的实现边界见[模块文档索引](docs/modules/README.md)。

### 依赖方向

```text
@nexum/persistence-* ──> @nexum/persistence ──> @nexum/core
@nexum/integrations ─────────────────────────> @nexum/core
@nexum/application ──> @nexum/core + persistence-* + integrations
@nexum/protocol       纯协议模型，不依赖 Runtime 实现
@nexum/client ───────> @nexum/protocol
@nexum/server ───────> @nexum/core + @nexum/application + @nexum/protocol
@nexum/surface-adapter ──> @nexum/client
@nexum/chat-surface ─────> @nexum/surface-adapter
@nexum/cli ──────────────> @nexum/surface-adapter + @nexum/client
@nexum/surfaces ─────────> Client + Chat Surface，并组合本地运行时依赖
@nexum/test ─────────────> Application + Server + Client + Core
```

依赖方向的核心原则是：Core 不导入实现包；Persistence 和 Integrations 通过 Port 实现环境能力；Application 负责组合；Client 不依赖 Core 或 Server；Surface 不复制 Agent Loop。

## 什么时候替换哪个模块

| 需求                                  | 组合建议                                                         |
| ------------------------------------- | ---------------------------------------------------------------- |
| 只想测试 Coding Loop 或嵌入一个 Agent | `createEmbeddedRuntime` + `@nexum/persistence-memory`            |
| 需要本地 CLI 和可查看的运行状态       | `createLocalRuntime` + `@nexum/persistence-file`                 |
| 需要服务重启后恢复 Session 和事件     | `createSqliteRuntime` + `@nexum/server`                          |
| 使用企业模型网关                      | 注入自己的 `ModelPort` 或 Provider Catalog                       |
| 限制文件和 Shell 能力                 | 注入自己的 `HostPort`/Sandbox，并保留 Core Permission            |
| 使用远程数据库或事件总线              | 实现 `@nexum/persistence` 的 Store/Event Port                    |
| 换成另一种 UI                         | 复用 `@nexum/protocol`/`@nexum/client`，按需实现 Surface Adapter |

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

长任务的输入、事件序列、权限等待、Question 暂停、上下文压缩和终态都可以通过协议观察和恢复。详细生命周期见[Session 文档](docs/capabilities/session.md)、[事件文档](docs/capabilities/events.md)、[Question 协议](docs/ui/question.md)和[Permission 协议](docs/ui/permission.md)。

## 文档导航

根 README 是 Nexum 文档总入口。先按协作问题选择能力或 UI 文档，再通过模块文档了解实现边界；API 文档用于接口联调，源码和测试是协议事实来源。

### 架构与规则

- [文档维护规则](docs/README.md)
- [API 文档规则](apis/README.md)
- [包模块地图与包级验证](packages/README.md)
- [模块文档索引](docs/modules/README.md)
- [模块边界](docs/architecture/module-boundaries.md)
- [Runtime 运行流程](docs/architecture/runtime-flow.md)

### UI 交互协议

- [UI 交互协议总览](docs/ui/interaction-protocol.md)
- [UI 状态机](docs/ui/states.md)
- [Question/反问协议](docs/ui/question.md)
- [Permission/权限协议](docs/ui/permission.md)

### 能力文档

- [Session 生命周期与历史](docs/capabilities/session.md)
- [事件流、序列与恢复](docs/capabilities/events.md)
- [Skill 能力](docs/capabilities/skills.md)
- [Integrations 能力](docs/capabilities/integrations.md)
- [Model/Runtime 能力](docs/capabilities/model-runtime.md)
- [Context 与 History](docs/capabilities/context-and-history.md)

### API 文档

- [完整 Nexum Runtime API](apis/nexum.md)

### 模块文档

- [`@nexum/protocol`](docs/modules/nexum-protocol.md)
- [`@nexum/client`](docs/modules/nexum-client.md)
- [`@nexum/server`](docs/modules/nexum-server.md)
- [`@nexum/surface-adapter`](docs/modules/nexum-surface-adapter.md)
- [`@nexum/core`](docs/modules/nexum-core.md)
- [`@nexum/application`](docs/modules/nexum-application.md)
- [`@nexum/persistence`](docs/modules/nexum-persistence.md)
- [`@nexum/integrations`](docs/modules/nexum-integrations.md)
- [`@nexum/chat-surface`](docs/modules/nexum-chat-surface.md)
- [`@nexum/cli`](docs/modules/nexum-cli.md)
- [`@nexum/surfaces`](docs/modules/nexum-surfaces.md)
- [`@nexum/test`](docs/modules/nexum-test.md)

### 包级 README

- [`@nexum/core`](packages/nexum-core/README.md)
- [`@nexum/application`](packages/nexum-application/README.md)
- [`@nexum/persistence`](packages/nexum-persistence/README.md)
- [`@nexum/persistence-memory`](packages/nexum-persistence-memory/README.md)
- [`@nexum/persistence-file`](packages/nexum-persistence-file/README.md)
- [`@nexum/persistence-sqlite`](packages/nexum-persistence-sqlite/README.md)
- [`@nexum/integrations`](packages/nexum-integrations/README.md)
- [`@nexum/protocol`](packages/nexum-protocol/README.md)
- [`@nexum/client`](packages/nexum-client/README.md)
- [`@nexum/server`](packages/nexum-server/README.md)
- [`@nexum/surface-adapter`](packages/nexum-surface-adapter/README.md)
- [`@nexum/chat-surface`](packages/nexum-chat-surface/README.md)
- [`@nexum/cli`](packages/nexum-cli/README.md)
- [`@nexum/surfaces`](packages/nexum-surfaces/README.md)
- [`@nexum/test`](packages/nexum-test/README.md)

## 项目状态

当前仓库已经具备可独立组合的 Core、Persistence、Integrations、Application、Protocol、Server、Client 和 Surface；Test Workbench、文件持久化、SQLite 持久化、HTTP/SSE、CLI、权限、Question、Skill、MCP 和执行恢复均有对应实现或验证入口。Nexum 仍处于持续演进阶段，新增能力优先通过 Port、Protocol 和可替换模块接入，避免把宿主 UI 或具体供应商绑定进 Core。

## License

MIT
