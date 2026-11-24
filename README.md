# Nexum

Nexum 是一个由最小功能单元组合而成的独立 Agent Runtime，拥有独立的包名、协议名和组合边界。

Nexum 不试图提供一个绑定特定 UI 的完整产品，也不是把所有能力塞进一个“大 Agent 类”。它把 Agent 运行过程中真正稳定、跨场景复用的部分收敛为 Core，把持久化、外部系统接入和 UI/协议桥接等环境差异放到明确的适配器包中，再通过 Application 组合业务编排，最后连接 Web、桌面端、TUI、CLI 或企业内部应用。

## GitHub 项目简介（中文）

Nexum 是一个面向多场景 Agent 应用的可组合运行时。它将 Coding Loop、Session、上下文压缩、权限、Skill、Memory 和 MCP 等稳定运行语义沉淀在独立 Core 中，通过 Persistence 和 Integrations 接入存储、模型、文件系统和宿主能力，再由 Application 组合运行时，并以协议层连接 Web、Desktop、TUI、CLI 及企业应用。Nexum 关注最小功能单元、清晰分层、长任务可恢复和 UI/运行时解耦，让同一套 Agent 能力可以被不同产品安全复用。

## GitHub Project Description (English)

Nexum is a composable Agent Runtime for Web, Desktop, TUI, CLI, and enterprise applications. It isolates durable runtime semantics—Coding Loop, sessions, context compaction, permissions, skills, memory, and MCP—in a UI-agnostic Core, while replaceable adapters provide models, storage, filesystem, and host capabilities. A protocol-first boundary connects the runtime to any surface, enabling resumable long-running tasks, clear layering, and reuse without coupling application UI to execution internals.

## Nexum 解决什么问题

一个 Agent 应用通常同时包含几类变化速度不同的内容：

- Coding Loop、Session、上下文压缩、权限语义和 Skill 调用等运行语义；
- 模型、文件系统、Shell、数据库、事件总线和 MCP 等环境能力；
- HTTP、SSE、WebSocket 或进程内调用等传输协议；
- Web、Desktop、TUI、CLI 或业务系统等交互呈现。

如果这些内容全部放在同一层，替换一个 UI 会牵动 Agent Loop，替换存储会影响协议，测试只能依赖完整应用启动。Nexum 的做法是把它们拆成可组合单元：Core 负责语义，Persistence/Integrations 负责环境实现，Protocol 负责公开边界，Application 负责运行时和服务编排，Surface 负责具体 UI 场景。

## 三层架构

```text
┌──────────────────────────────────────────────────────────┐
│ 应用层 Application / Surface                              │
│ Web · Desktop · TUI · CLI · 企业内部页面 · Test Workbench │
│ 负责场景、交互布局、卡片投影和用户操作                     │
└───────────────────────────┬──────────────────────────────┘
                            │ @nexum/client
┌───────────────────────────▼──────────────────────────────┐
│ 协议层 Protocol                                           │
│ JSON Envelope · Capability · Session · Event · SSE         │
│ Permission · Question · Skill · 错误和版本兼容             │
└───────────────────────────┬──────────────────────────────┘
                            │ Runtime 注入
┌───────────────────────────▼──────────────────────────────┐
│ 基础层 Foundation                                          │
│ @nexum/core：Coding Loop、Session 语义、权限、上下文、Skill │
│ 只依赖端口和领域契约，不依赖 UI、HTTP、文件系统或模型 SDK   │
└───────────────────────────┬──────────────────────────────┘
                            │ Ports
       @nexum/persistence + @nexum/integrations + @nexum/application
                     提供实现和运行时组合
```

### 基础层：`@nexum/core`

Core 是 Nexum 的最小功能单元集合，承载所有跨应用仍然成立的运行语义：

- Coding Loop：模型流式输出、工具调用、工具结果、续跑和终态收敛；
- Session：创建、恢复、状态流转、取消和并发运行边界；
- Prompt admission：输入先进入可恢复的会话队列，再由执行器推进；
- Permission：`allow_once`、`allow_always`、`deny` 和 Session 隔离；
- Question：结构化反问、答案提交、取消和安全暂停；
- Context：上下文预算、项目上下文、压缩、恢复和失败安全；
- Skill：Skill 注册、调用语义、权限边界和事件；
- Memory、MCP、Host、Model、Store 和 Event 等可替换端口与领域错误。

Core 不知道页面长什么样，也不负责决定使用 JSON 文件、SQLite 还是远程数据库。缺少的环境能力必须通过端口注入，默认实现由 Persistence 和 Integrations 提供；Application 只负责把这些端口组合成可运行服务。

### 协议层：`@nexum/protocol`、`@nexum/client`、`@nexum/server`

协议层把运行语义变成稳定的外部边界：

- `@nexum/protocol` 定义 `nexum.runtime.v1`、JSON Envelope、能力发现、请求/响应、事件和 SSE 数据模型；
- `@nexum/client` 负责协议编码、响应校验、错误归一化和 SSE 消费，不依赖 Core 或 Server；
- `@nexum/server` 把已经组合好的 Runtime 绑定到 HTTP/SSE，只负责传输、路由、错误映射和事件订阅。

协议层还定义交互什么时候发生以及如何表达：

| 运行事实         | 协议事件                             | 应用层表现             |
| ---------------- | ------------------------------------ | ---------------------- |
| 模型产生文本     | `assistant.text`                     | 流式文本消息           |
| 模型请求工具     | `tool.request`                       | 工具调用卡片           |
| 工具返回结果     | `tool.result`                        | 执行结果卡片或折叠详情 |
| 需要用户授权     | `permission.requested`               | 权限确认卡片           |
| 需要用户补充信息 | `question.request`                   | 反问卡片，暂停后续工具 |
| 上下文正在压缩   | `context.compaction.*`               | 上下文状态条           |
| Skill 被激活     | `skill.activated`                    | Skill 活动卡片         |
| Session 到达终态 | `session.completed/failed/cancelled` | 完成、失败或取消状态   |

Core 产生事实，协议层表达事实，应用层决定如何呈现。应用层不能通过猜测文本来判断“是否需要反问”或“是否应该展示权限卡片”。

### 应用层：Surface 与场景应用

应用层把协议状态投影成用户能操作的场景：

- Web 工作台可以将事件流投影为聊天区、工具卡片、权限抽屉和运行监控；
- TUI 可以将同一组事件映射为终端组件和键盘操作；
- Desktop、CLI、Mobile 或企业页面可以各自拥有不同的布局和交互方式；
- 它们共享同一套 Protocol/Client，不需要复制 Core 的执行规则。

`@nexum/surfaces` 是当前的参考 Surface，不是 Core 的组成部分，也不限定未来使用 Solid、Vue、React 或原生 UI。

## 默认实现与 Runtime 组合

默认实现按职责拆成三个包：`@nexum/persistence` 保存可恢复状态，`@nexum/integrations` 对接模型、Host、目录和 MCP，`@nexum/application` 承载 Skill/Tool/Question 编排以及 Runtime Composer。运行时由 Application 把前两者显式组合成两种形态：

```ts
import { createEmbeddedRuntime, createLocalRuntime } from "@nexum/application"

// 进程内组合：适合 Core 单元测试、嵌入式宿主和一次性场景
const embedded = createEmbeddedRuntime({ model })

// 本地服务组合：默认使用文件持久化
const local = createLocalRuntime({ dataDirectory: ".nexum" })
```

默认实现包括：

- `@nexum/persistence`：Session、Message、Interaction、Model Config、Role Prompt、Permission Policy、Skill 注册状态、Event 和 Memory 的文件/内存实现；
- `@nexum/integrations`：OpenAI-compatible Model、本地 Host、目录校验、项目上下文、Skill 文件来源和 MCP；
- `@nexum/application`：Skill Registry、Tool Registry、Question Broker、配置型 Coding Loop 和 Runtime Composer；
- 所有文件实现保留原子写入、损坏文件保护和敏感信息脱敏。

这里的“适配器”只指把 Core Port 接到外部技术或存储的实现。Permission Policy 是 Core 的领域策略，Skill Registry、Tool Registry 和 Question Broker 是 Application 服务；它们不再被归类或放入适配器包。

应用可以替换任意一个端口而不修改 Core 或 Protocol，例如把文件 Store 替换为 SQLite，把 OpenAI-compatible Model 替换为企业模型网关，或把本地 Host 替换为沙箱执行器。

## `@nexum/test`：完整链路验证

`@nexum/test` 不是业务功能模块，而是一个只用于测试和演示的组合包。它将 Core、Persistence、Integrations、Application、Protocol、Client 和 Surface 连接成一条真实链路。

POC 默认使用工作树下的 `.nexum-test/` 目录和 `createLocalRuntime`，不使用内存作为真实运行时存储。Session、消息、交互、事件、模型配置、权限策略和 Memory 都可以在进程重启后恢复；内存实现只用于 Core 单元测试或显式的嵌入式场景。

```bash
# 启动 Nexum Test Workbench（Server + Surface）
bun run --cwd packages/nexum-test dev
```

打开 <http://127.0.0.1:5173> 后，可以验证：

1. 创建和恢复 Session；
2. 配置模型并探测能力；
3. 提交长任务 Prompt；
4. 观察文本、工具、权限、反问、Skill、上下文和终态事件；
5. 刷新页面或重启服务后恢复历史状态。

## 包模块地图

| 包                    | 层级         | 职责                                                                   | 能否被替换                    |
| --------------------- | ------------ | ---------------------------------------------------------------------- | ----------------------------- |
| `@nexum/core`         | 基础层       | 领域语义、Agent Loop、端口和生命周期                                   | 通过端口替换环境实现          |
| `@nexum/persistence`  | 持久化实现层 | Session、Message、Interaction、Policy、Event、Memory 等文件/内存 Store | 可替换为数据库或远程存储      |
| `@nexum/integrations` | 外部集成层   | Model、Host、目录校验和 MCP                                            | 可替换为网关、沙箱或其他 SDK  |
| `@nexum/application`  | 应用编排层   | Skill、Tool、Question、Configured Loop 和 Runtime Composer             | 可替换为其他应用组合          |
| `@nexum/protocol`     | 协议层       | Wire Contract、Envelope、事件和能力模型                                | 以版本演进                    |
| `@nexum/client`       | 协议层       | HTTP/SSE Client 和协议消费                                             | 可替换为其他语言客户端        |
| `@nexum/server`       | 协议绑定层   | HTTP/SSE 路由、错误边界和事件投递                                      | 可替换为其他传输绑定          |
| `@nexum/chat-surface` | 应用层       | 可嵌入聊天组件和聊天交互                                               | 可替换为其他聊天 Surface      |
| `@nexum/surface-adapter` | 协议适配层 | `ChatProtocolAdapter` 契约、协议错误归一化和默认实现                   | 所有聊天类 Surface 共用       |
| `@nexum/cli`          | 应用层       | 终端 Surface：REPL、思考动画、交互问答和管理面命令                     | 可替换为其他终端 UI           |
| `@nexum/surfaces`     | 应用层       | Web 参考交互面和协议状态投影                                           | 可替换为 TUI、Desktop 等；CLI 已由 `@nexum/cli` 提供 |
| `@nexum/test`         | 验证层       | 跨层 POC、文件持久化和重启恢复验证                                     | 不作为生产依赖                |

依赖方向保持单向：

```text
@nexum/persistence ─────> @nexum/core
@nexum/integrations ────> @nexum/core
@nexum/application ─────> @nexum/core + Persistence + Integrations
@nexum/protocol           纯协议模型
@nexum/client ──────────> @nexum/protocol
@nexum/server ──────────> @nexum/core + @nexum/application + @nexum/protocol
@nexum/surface-adapter ─> @nexum/client
@nexum/chat-surface ────> @nexum/surface-adapter
@nexum/surfaces ────────> @nexum/client + @nexum/chat-surface
@nexum/cli ─────────────> @nexum/surface-adapter + @nexum/client
@nexum/test ────────────> Core + Persistence + Integrations + Application + Protocol + Client + Surface
```

## 文档导航

根 README 是 Nexum 文档总入口。先按协作问题选择 UI/能力文档，再通过模块文档了解实现边界；API 文档用于接口联调，源码和测试是协议事实来源。模块文档状态为“现状基线”，最后核对日期为 2026-11-24。

### 规则与架构

- [文档维护规则](docs/README.md)
- [API 文档规则](apis/README.md)
- [包模块地图与包级验证](packages/README.md)
- [模块文档索引与一对一清单](docs/modules/README.md)
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

- [模块索引](docs/modules/README.md)
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

新增或修改文档时，必须同步更新本节、对应索引和模块文档中的“修改同步清单”，保持从根 README 可达。

## Nexum 的优势

### 1. 最小功能单元，而不是单体框架

Agent Loop、权限、上下文、Skill、存储和呈现都可以独立测试和组合。宿主只引入真正需要的能力，不必接受一整套不可拆分的应用运行时。

### 2. 一套语义，多种宿主

Web、桌面端、TUI、CLI 和企业页面共享同一套 Session、权限、Question、事件和恢复语义；差异只存在于 Adapter、Transport 和 Surface。

### 3. Core 与环境彻底隔离

Core 不绑定文件系统、网络、模型 SDK、数据库或 UI 框架。替换供应商、存储、执行环境和前端技术，不需要重写 Coding Loop。

### 4. 长任务可观测、可恢复

Prompt admission、事件序列、工具结果、权限等待、Question 暂停、上下文压缩和终态都通过协议显式表达。用户看到的是完整交互过程，而不是只看到最后一段答案。

### 5. 安全边界是运行时语义

工具调用必须经过权限门禁，资源路径受工作目录约束，权限和事件内容做脱敏，取消和失败会收敛到明确状态。安全规则不依赖某个页面是否正确实现。

### 6. 默认可用，生产可替换

官方提供开箱即用的本地 Persistence、Integrations、Application 实现和 HTTP/SSE 绑定，便于快速验证；生产环境可以逐个替换为数据库、模型网关、沙箱、消息总线或企业协议。

### 7. 协议优先，应用持续演进

协议是 Core 与应用之间的稳定边界。新增 Surface 或新的业务页面时，优先复用已有协议，而不是复制一套隐藏的 Agent 状态机。

## 快速开始

```bash
bun install
```

运行 Nexum Test Workbench：

```bash
bun run --cwd packages/nexum-test dev
```

分别验证包：

```bash
cd packages/nexum-core && bun test && bun run typecheck:tsc
cd ../nexum-persistence && bun test && bun run typecheck:tsc
cd ../nexum-integrations && bun test && bun run typecheck:tsc
cd ../nexum-application && bun test && bun run typecheck:tsc
cd ../nexum-server && bun test && bun run typecheck:tsc
cd ../nexum-protocol && bun test && bun run typecheck
cd ../nexum-client && bun test && bun run typecheck
cd ../nexum-surface-adapter && bun test && bun run typecheck:tsc
cd ../nexum-cli && bun test && bun run typecheck:tsc
cd ../nexum-test && bun test && bun run typecheck:tsc
```

更多细节见：

- [`@nexum/core`](packages/nexum-core/README.md)
- [`@nexum/persistence`](packages/nexum-persistence/README.md)
- [`@nexum/integrations`](packages/nexum-integrations/README.md)
- [`@nexum/application`](packages/nexum-application/README.md)
- [`@nexum/protocol`](packages/nexum-protocol/README.md)
- [`@nexum/client`](packages/nexum-client/README.md)
- [`@nexum/server`](packages/nexum-server/README.md)
- [`@nexum/surface-adapter`](packages/nexum-surface-adapter/README.md)
- [`@nexum/chat-surface`](packages/nexum-chat-surface/README.md)
- [`@nexum/cli`](packages/nexum-cli/README.md)
- [`@nexum/surfaces`](packages/nexum-surfaces/README.md)
- [`@nexum/test`](packages/nexum-test/README.md)

## 项目状态

当前分支为 `dev-v0.0.1`。Nexum 已完成第一阶段的 Core/Adapter/Protocol/Server/Surface 解耦和持久化 POC 验证，后续可以在不修改 Core 运行语义的前提下继续增加新的传输、存储、模型、执行环境和交互 Surface。
