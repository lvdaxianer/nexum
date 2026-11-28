# Nexum Workspace 包

`packages/` 只承载 Nexum Runtime 的可组合模块。根 workspace 使用 `packages/nexum-*` 显式匹配包，新增目录不会自动成为运行时依赖。

项目级总入口是根目录的 [`README.md`](../README.md)；模块实现边界和跨层协作说明从根 README 的文档导航进入。

## 包模块

| 包                   | 层级         | 职责                                                                                                   | 能否被替换                   |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `nexum-core`         | 基础层       | Coding Loop、Session、Permission、Question、Context、Skill、Memory/MCP/Host/Model/Store 端口和领域语义 | 通过端口替换环境实现         |
| `nexum-persistence`  | 持久化实现层 | Session、Message、Interaction、Policy、Skill 注册状态、Event、Memory 等文件/内存 Store                 | 可替换为数据库或远程存储     |
| `nexum-integrations` | 外部集成层   | Model、Host、目录校验、项目上下文、Skill 文件来源和 MCP                                                | 可替换为网关、沙箱或其他 SDK |
| `nexum-application`  | 应用编排层   | Skill、Tool、Question、Configured Loop 和 Runtime Composer                                             | 可替换为其他应用组合         |
| `nexum-protocol`     | 协议层       | `nexum.runtime.v1`、JSON Envelope、能力发现、Session、交互和事件模型                                   | 以版本演进                   |
| `nexum-client`       | 协议层       | HTTP/SSE 协议客户端、响应校验、错误归一化和事件消费                                                    | 可替换为其他语言客户端       |
| `nexum-surface-adapter` | 协议适配层   | `ChatProtocolAdapter` 契约、协议错误归一化与默认实现                             | 所有聊天类 Surface 共用       |
| `nexum-cli`          | 应用层       | 终端 Surface:REPL、思考动画、交互问答与管理面命令                                  | 可替换为其他终端 UI           |
| `nexum-server`       | 协议绑定层   | 将已组合 Runtime 暴露为 HTTP/SSE，不在 Server 内隐式创建业务实现                                       | 可替换为其他传输绑定         |
| `nexum-chat-surface` | 应用层       | 可嵌入聊天组件和聊天交互                                                                               | 可替换为其他聊天 Surface     |
| `nexum-test`         | 验证层       | 完整 Test Workbench，通过 `import` 引入 `nexum-chat-surface`                                      | 不作为生产依赖               |

每个包的实现边界和接入说明见 [`docs/modules/README.md`](../docs/modules/README.md)；直接入口如下：[`core`](../docs/modules/nexum-core.md)、[`persistence`](../docs/modules/nexum-persistence.md)、[`integrations`](../docs/modules/nexum-integrations.md)、[`application`](../docs/modules/nexum-application.md)、[`protocol`](../docs/modules/nexum-protocol.md)、[`client`](../docs/modules/nexum-client.md)、[`server`](../docs/modules/nexum-server.md)、[`surface-adapter`](../docs/modules/nexum-surface-adapter.md)、[`chat-surface`](../docs/modules/nexum-chat-surface.md)、[`cli`](../docs/modules/nexum-cli.md)、[`test`](../docs/modules/nexum-test.md)。

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

Core 不导入实现包；Persistence 和 Integrations 通过端口实现 Core 所需环境能力；Application 负责编排。Permission Policy 属于 Core 领域语义，Skill/Tool/Question 属于 Application 服务，不作为适配器；Surface 不导入 Core，Test 才负责把各层组合到一起。

## 常用验证

测试应从目标包目录执行：

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

根目录的 `bun dev` 启动 `@nexum/test` 的 Server + Surface 工作台；完整 API 说明见 [`apis/nexum.md`](../apis/nexum.md)。
