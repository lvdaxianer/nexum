# `@nexum/application`

状态：现状基线

权威来源：[`packages/nexum-application/src/index.ts`](../../packages/nexum-application/src/index.ts)、[`packages/nexum-application/README.md`](../../packages/nexum-application/README.md)

最后核对：2026-11-24

## 职责

`@nexum/application` 是 Nexum 的应用编排层。它把 Core 端口、Persistence Store 和 Integrations Adapter 组合成可运行的 Runtime，并提供 Skill Registry、Tool Registry、Question Port、Permission Broker、Configured Coding Loop 和 Event Hub 的应用级构造器。

Application 不定义通用存储格式，也不直接处理 HTTP/UI。替换模型、Host 或文件 Store 时，应替换端口实现，而不是把适配逻辑复制到编排层。

## 公开入口与组合方式

入口 [`src/index.ts`](../../packages/nexum-application/src/index.ts) 主要导出：

- `createEmbeddedRuntime(options)`：使用内存/显式注入组件，适合嵌入和单元测试。
- `createLocalRuntime(options)`：使用文件 Store，适合本地服务和可恢复运行。
- `createDefaultRuntime`：`createLocalRuntime` 的别名。
- `createNexumQuestionPort`、`createNexumSkillRegistry`、`createNexumToolRegistry`、`createNexumConfiguredCodingLoop`。
- `createNexumEventHub` 及相关 Event 类型。

```ts
import { createLocalRuntime } from "@nexum/application"

const runtime = createLocalRuntime({ dataDirectory: ".nexum" })
const session = await runtime.sessions.create({ directory: process.cwd() })
await runtime.close()
```

`createEmbeddedRuntime` 会组合 Session、Model、Permission、Question、Skill、Tool、Host、Memory、Event Hub 和 Coding Loop；`createLocalRuntime` 在此基础上把各 Store 指向数据目录。

## Runtime 与端口映射

| Application 组件                                   | 组合来源                        | 作用                       |
| -------------------------------------------------- | ------------------------------- | -------------------------- |
| `sessionService`、`codingLoop`                     | Core + Store + Model/Host       | Session 生命周期和运行     |
| `permissionBroker`、`questionPort`                 | Core + Interaction/Policy Store | 待处理交互和回复           |
| `skillRegistry`、`skillInvocation`、`toolRegistry` | Core + Skill/Host               | Skill/工具发现、权限和执行 |
| `eventHub`、`messageStore`                         | Persistence                     | 事件投递和历史消息         |
| `modelConfig`、`rolePrompt`、`modelProbe`          | Persistence + Integrations      | 模型配置、角色提示和探测   |
| `memory`、`host`、`mcp`                            | Persistence/Integrations        | 上下文记忆、目录和外部能力 |

Server 使用 Application 提供的 Runtime，再将其映射为 [`@nexum/protocol`](./nexum-protocol.md)；UI 不应直接依赖 Application 的内部组合对象。

## 依赖边界

Application 依赖 Core、Persistence、Integrations，不能被 Client 或 UI 反向依赖。它是运行时组装层，不拥有 HTTP 路由；完整边界见 [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md)。

## 测试与验证

```sh
cd packages/nexum-application
bun test
bun run typecheck
```

重点测试位于 [`packages/nexum-application/test/runtime.test.ts`](../../packages/nexum-application/test/runtime.test.ts)，覆盖 Embedded/Local Runtime、文件存储、Skill 注册、Memory、MCP 和模型流。

## 修改同步清单

- 修改 Runtime 组合或默认 Store：同步 [`@nexum/persistence`](./nexum-persistence.md)、[`@nexum/integrations`](./nexum-integrations.md) 和 Test POC。
- 修改应用能力构造器：同步 Server 模块文档、能力文档和对应 Application 测试。
- 修改依赖方向或端口注入：同步 [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md)。
