# Nexum 与 OpenCode Workspace 包

`packages/` 同时承载 Nexum Runtime 和原 OpenCode 产品。两者有明确边界：Nexum 复用经过验证的 Agent 运行语义，但以 `@nexum/*` 作为独立的组合式模块出口；原 OpenCode 包继续服务原产品的 CLI、TUI、Desktop 和完整应用链路。

## Nexum 包

| 包 | 定位 | 主要内容 |
| --- | --- | --- |
| `nexum-core` | 基础层 | Coding Loop、Session、Permission、Question、Context、Skill、Memory/MCP/Host/Model/Store 端口和领域语义 |
| `nexum-adapters` | 默认实现与组合层 | OpenAI-compatible Model、文件/内存 Store、本地 Host、Tools、Skill、Event、Memory、MCP 和 Runtime Composer |
| `nexum-protocol` | 协议层 | `nexum.runtime.v1`、JSON Envelope、能力发现、Session、交互和事件模型 |
| `nexum-client` | 协议层 | HTTP/SSE 协议客户端、响应校验、错误归一化和事件消费 |
| `nexum-server` | 协议绑定层 | 将已组合 Runtime 暴露为 HTTP/SSE，不在 Server 内隐式创建业务实现 |
| `nexum-surfaces` | 应用层 | 可替换的 Web 参考 Surface，负责把协议事件投影为聊天、卡片、抽屉和状态视图 |
| `nexum-test` | 验证层 | 跨层 POC、文件持久化、重启恢复和可启动 Test Workbench；不作为生产依赖 |

### Nexum 依赖方向

```text
nexum-adapters ────────> nexum-core
nexum-protocol            纯协议模型
nexum-client ──────────> nexum-protocol
nexum-server ──────────> nexum-core + nexum-adapters + nexum-protocol
nexum-surfaces ────────> nexum-client
nexum-test ────────────> core + adapters + protocol + client + surfaces
```

Core 不导入 Adapter；Adapter 通过端口实现 Core 所需环境能力；Surface 不导入 Core；Test 才负责把各层组合到一起。

## 原 OpenCode 产品包

这些包仍属于原 OpenCode 产品，不是 Nexum Runtime 的基础依赖：

- `core`、`server`、`schema`、`util`：原产品的运行时、服务和共享基础设施；
- `cli`、`tui`、`desktop`：原产品的命令行、终端和桌面入口；
- `ui`、`theme`、`session-ui`、`nav-menus`：原产品 UI、主题和会话界面；
- `client`、`protocol`、`sdk`：原产品协议、客户端和 SDK；
- `plugin`、`plugin-browser`、`gui-plugins`：插件及浏览器扩展能力；
- `ai`、`codemode`、`http-recorder`、`httpapi-codegen`：模型、受限代码执行、网络录制和 API 工具；
- `data`、`effect-drizzle-sqlite`、`simulation`、`stories`、`script`、`patchmark`：数据、存储、模拟、故事、构建和开发工具；
- `latex`、`merman`：LaTeX 与 Mermaid 内容渲染。

## 目录维护规则

旧的 `headless-core`、`headless-server`、`headless-ui` 已由 Nexum 包替代，不再作为 workspace 模块维护。它们的历史实现已经迁移到 `nexum-core`、`nexum-adapters`、`nexum-server` 和 `nexum-surfaces`。

新增 Nexum 能力时，先判断它属于：

1. Core 运行语义和端口；
2. 默认环境实现和 Runtime 组合；
3. Protocol/Client/Server 公开边界；
4. 某个具体场景的 Surface 或 Test。

不要把页面状态、文件读写、HTTP 路由或供应商 SDK 放回 Core。

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

完整架构说明见仓库根目录 [`README.md`](../README.md)。
