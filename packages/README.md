# Nexum Workspace 包

`packages/` 只承载 Nexum Runtime 的可组合模块。根 workspace 使用 `packages/nexum-*` 显式匹配包，新增目录不会自动成为运行时依赖。

## 包模块

| 包 | 层级 | 职责 | 能否被替换 |
| --- | --- | --- | --- |
| `nexum-core` | 基础层 | Coding Loop、Session、Permission、Question、Context、Skill、Memory/MCP/Host/Model/Store 端口和领域语义 | 通过端口替换环境实现 |
| `nexum-adapters` | 默认实现层 | OpenAI-compatible Model、文件/内存 Store、本地 Host、Tools、Skill、Event、Memory、MCP 和 Runtime Composer | 可以按端口替换 |
| `nexum-protocol` | 协议层 | `nexum.runtime.v1`、JSON Envelope、能力发现、Session、交互和事件模型 | 以版本演进 |
| `nexum-client` | 协议层 | HTTP/SSE 协议客户端、响应校验、错误归一化和事件消费 | 可替换为其他语言客户端 |
| `nexum-server` | 协议绑定层 | 将已组合 Runtime 暴露为 HTTP/SSE，不在 Server 内隐式创建业务实现 | 可替换为其他传输绑定 |
| `nexum-surfaces` | 应用层 | Web 参考 Surface，负责把协议事件投影为聊天、卡片、抽屉和状态视图 | 可替换为其他 UI |
| `nexum-test` | 验证层 | 跨层 POC、文件持久化、重启恢复和可启动 Test Workbench | 不作为生产依赖 |

## 依赖方向

```text
nexum-adapters ────────> nexum-core
nexum-protocol            纯协议模型
nexum-client ──────────> nexum-protocol
nexum-server ──────────> nexum-core + nexum-adapters + nexum-protocol
nexum-surfaces ────────> nexum-client
nexum-test ────────────> core + adapters + protocol + client + surfaces
```

Core 不导入 Adapter；Adapter 通过端口实现 Core 所需环境能力；Surface 不导入 Core；Test 才负责把各层组合到一起。

## 常用验证

测试应从目标包目录执行：

```bash
cd packages/nexum-core && bun test && bun run typecheck:tsc
cd ../nexum-adapters && bun test && bun run typecheck:tsc
cd ../nexum-server && bun test && bun run typecheck:tsc
cd ../nexum-protocol && bun test && bun run typecheck
cd ../nexum-client && bun test && bun run typecheck
cd ../nexum-test && bun test && bun run typecheck:tsc
```

根目录的 `bun dev` 启动 `@nexum/test` 的 Server + Surface 工作台；完整 API 说明见 [`apis/nexum.md`](../apis/nexum.md)。
