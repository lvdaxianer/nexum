# Proposal

## Why

当前 Headless 能力已经形成可运行的 Agent Runtime，但公开身份、包名、默认路径和协议命名仍然带有 OpenCode/Headless 的迁移痕迹，默认实现也集中在 Core 和 Server 中。现在需要将它收敛为独立的 Nexum Runtime，并用包边界隔离内核语义、默认适配器、公开协议和应用实现。

## What Changes

- 将新 Runtime 的公开品牌统一为 Nexum，新增 `@nexum/*` 包命名和 `nexum.runtime.v1` 协议命名。
- 将 Core 与文件存储、本地 Host、OpenAI-compatible Model、MCP 和 Memory 等默认实现分离到适配器包。
- 增加统一的默认 Runtime 装配入口，供本地服务、嵌入式运行和测试复用。
- 保持 Protocol 只依赖 Schema，Client 只依赖 Protocol/Schema，Server 负责绑定 Runtime 与 HTTP/SSE，UI 只依赖 Client。
- 为 Memory 和 MCP 提供可替换的基础能力端口及默认适配器入口。
- 将默认数据目录、环境变量、事件命名和文档从 Headless/OpenCode 迁移为 Nexum 命名。
- **BREAKING** 不再新增或继续扩展 `@opencode/headless-*` 作为 Nexum 的公开包名；旧 Headless 包仅作为迁移基线保留，直至后续清理。

## Capabilities

### New Capabilities

- `nexum-runtime-composition`: 定义 Runtime 如何注册、组合和启动 Core 能力及默认适配器。
- `nexum-default-adapters`: 定义 Nexum 提供的默认存储、模型、Host、事件、Memory 和 MCP 适配器。
- `nexum-public-identity`: 定义包名、协议名、默认路径、环境变量和事件命名的 Nexum 公开身份。

### Modified Capabilities

- 无。现有 Headless 能力规格保持行为不变，本变更主要建立 Nexum 的新组合入口和公开边界。

## Impact

- 影响 `packages/headless-core`、`packages/headless-server`、`packages/headless-ui`、`packages/protocol` 和 `packages/client` 的公开命名与依赖边界。
- 新增 Nexum Runtime/Adapter 入口及其契约测试；默认实现继续复用当前已验证的 Headless 行为。
- 影响 README、API 文档、环境变量、默认数据目录、协议事件和 OpenSpec 任务文档。
- 不修改完整 OpenCode Core、CLI、TUI、Desktop 的既有产品链路；它们继续作为迁移参考来源。
