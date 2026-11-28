# Nexum 模块边界

[English](../../architecture/module-boundaries.md)

状态：现状基线

权威来源：根 `README.md`、`packages/*/package.json`、各 package README 和源码入口

最后核对：2026-11-24

## 目标

Nexum 将 Agent Runtime 拆成可组合模块。每个模块有清晰的职责、依赖方向和替换边界；协议和 UI 不应反向侵入 Core 的运行语义。

## 模块地图

| 模块                 | 层级         | 负责什么                                                                            | 不负责什么                                        | 公开入口                                                                               |
| -------------------- | ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `nexum-core`         | 基础层       | Coding Loop、Session、Permission、Question、Context、Skill、端口和领域错误          | HTTP、UI、文件系统、具体模型 SDK                  | [`packages/nexum-core/README.md`](../../../packages/nexum-core/README.md)                 |
| `nexum-persistence`  | 持久化实现层 | Session、Message、Interaction、Policy、Event、Memory 和 Skill 状态的文件/内存 Store | Core 领域决策、HTTP 路由、UI                      | [`packages/nexum-persistence/README.md`](../../../packages/nexum-persistence/README.md)   |
| `nexum-integrations` | 外部集成层   | Model、Host、目录校验、项目上下文、Skill 来源和 MCP                                 | Session 编排、Surface 展示、HTTP 协议             | [`packages/nexum-integrations/README.md`](../../../packages/nexum-integrations/README.md) |
| `nexum-application`  | 应用编排层   | Skill/Tool/Question 服务、Configured Loop 和 Runtime Composer                       | 页面布局、HTTP 传输细节、Core 领域替代实现        | [`packages/nexum-application/README.md`](../../../packages/nexum-application/README.md)   |
| `nexum-protocol`     | 协议模型层   | `nexum.runtime.v1`、Envelope、能力、消息、交互和事件类型                            | 网络请求、状态持久化、UI 渲染                     | [`packages/nexum-protocol/README.md`](../../../packages/nexum-protocol/README.md)         |
| `nexum-client`       | 协议消费层   | HTTP/SSE 编码、响应校验、错误归一化和事件消费                                       | Core、Server 内部实现和页面业务规则               | [`packages/nexum-client/README.md`](../../../packages/nexum-client/README.md)             |
| `nexum-surface-adapter` | 协议适配层 | `ChatProtocolAdapter` 契约、错误归一化、默认实现 | Surface 业务规则、UI 渲染 | [`packages/nexum-surface-adapter/README.md`](../../../packages/nexum-surface-adapter/README.md) |
| `nexum-cli` | 应用呈现层 | 终端 REPL、事件投影、交互问答、管理面命令 | Core 执行、协议实现、UI 组件 | [`packages/nexum-cli/README.md`](../../../packages/nexum-cli/README.md) |
| `nexum-server`       | 协议绑定层   | HTTP/SSE 路由、错误边界、事件订阅和已组合 Runtime 的适配                            | 隐式创建业务实现、UI 组件、Core 规则              | [`packages/nexum-server/README.md`](../../../packages/nexum-server/README.md)             |
| `nexum-chat-surface` | 应用呈现层   | 可嵌入聊天组件、消息/事件/Question/Permission 展示                      | 创建 Session、模型配置、宿主级策略和 Runtime 决策 | [`packages/nexum-chat-surface/README.md`](../../../packages/nexum-chat-surface/README.md) |
| `nexum-test`         | 验证层       | 左侧管理工作台，并通过 ChatSurface 组合右侧聊天区                                     | 生产运行时依赖和公共 UI 发布                      | [`packages/nexum-test/README.md`](../../../packages/nexum-test/README.md)                 |

## 依赖方向

```text
nexum-persistence ─────> nexum-core
nexum-integrations ────> nexum-core
nexum-application ─────> nexum-core + persistence + integrations
nexum-protocol            纯协议模型
nexum-client ──────────> nexum-protocol
nexum-server ──────────> nexum-core + nexum-application + nexum-protocol
nexum-surface-adapter ─> nexum-client
nexum-chat-surface ────> nexum-surface-adapter
nexum-cli ─────────────> nexum-surface-adapter + nexum-client
nexum-test ────────────> core + persistence + integrations + application + protocol + client + chat-surface
```

依赖方向的关键约束：

- Core 只依赖端口和领域契约，不导入 UI、HTTP、文件系统或模型 SDK。
- Protocol 是纯模型包，不反向依赖 Core 或 Server。
- Client 可以依赖 Protocol，但不能依赖 Core 或 Server。
- Server 绑定已经组合好的 Runtime，并负责传输边界，不在请求处理中偷偷创建业务实现。
- 聊天类 Surface 通过 Surface Adapter 消费协议，其余 Surface 直接通过 Client；Test 才负责把多个层组合到一起进行跨层验证。

## 变更边界

修改某个模块的公开导出、依赖方向、生命周期或错误语义时，至少同步：

1. 该模块文档和 package README；
2. 对应的能力文档；
3. Protocol/API 文档（如果跨越公开边界）；
4. 受影响的测试命令和验证说明；
5. 根 README 的文档导航（如果新增或移动文档）。

模块文档的详细职责和同步清单见 `docs/modules/` 下对应文件。
