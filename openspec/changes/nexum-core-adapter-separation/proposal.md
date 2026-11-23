# Proposal

## Why

Nexum 当前已经具备 Core、Protocol、Server 和参考界面的雏形，但 `@nexum/adapters` 同时承载持久化、外部技术适配、应用服务和 Runtime 组合，职责边界仍然混杂。Core 也保留了若干具体的内存默认实现，导致端口替换边界不完整。本变更需要一次性拆分包职责，删除旧聚合包，并继续用文件持久化的可运行 Test Workbench 验证完整链路。

## What Changes

- **BREAKING** 删除 `@nexum/adapters` 聚合包，不保留兼容门面。
- **BREAKING** 新增 `@nexum/persistence`、`@nexum/integrations` 和 `@nexum/application`，分别承载持久化、外部技术适配和应用服务/Runtime 组合。
- **BREAKING** Core 删除 Session、Message、Permission Policy 等具体默认实现，改为要求宿主显式注入必需 Port。
- **BREAKING** 将交互接入包从 `nexum-ui` / `@nexum/ui` 更名为 `nexum-surfaces` / `@nexum/surfaces`，为 Web、TUI、CLI、Desktop、Headless 等场景保留扩展空间。
- 将 Session、Message、Interaction、Model Config、Permission Policy、Event、Memory 和 Role Prompt 的内存/文件实现归入 Persistence。
- 将 OpenAI-compatible Model、Local Host、MCP、目录校验、文件上下文和本地 Skill Source 归入 Integrations。
- 将 Skill Registry、Tool Registry、Question Broker 和 Runtime Composer 归入 Application；它们不再伪装成基础设施适配器。
- 让 Server 接收已经组合好的 Runtime，只负责 HTTP/SSE、Protocol 映射和错误边界。
- 新增 `@nexum/test`，同时提供跨层自动化验证和可启动 POC Workbench。
- POC 使用文件持久化 `.nexum-test`，重启后能够恢复 Session、消息、事件和交互状态；内存实现只能作为 Core 单元测试 double。
- POC 通过真实 Protocol envelope、Client 和 Surface Adapter 展示文本、反问、卡片、事件、运行状态、完成、失败和取消。

## Capabilities

### New Capabilities

- `nexum-core-boundary`: Core 只依赖纯契约和领域语义，所有环境能力通过 Port 注入。
- `nexum-persistent-poc`: Test Workbench 使用文件持久化跑通 Core、Adapter、Protocol、Client 和 Surface 的完整链路。
- `nexum-surface-adapters`: 交互呈现面使用可扩展的 surfaces 命名和 Adapter 边界。
- `nexum-runtime-composition`: Runtime 默认组合和生命周期由 Adapter 提供，Server 不再隐式创建 Core 默认实现。

### Modified Capabilities

<!-- 当前仓库没有已归档的同名 Runtime capability，因此不声明 Modified Capabilities。 -->

## Impact

- 受影响目录：`packages/nexum-core`、`packages/nexum-persistence`、`packages/nexum-integrations`、`packages/nexum-application`、`packages/nexum-protocol`、`packages/nexum-client`、`packages/nexum-server`、`packages/nexum-surfaces`、`packages/nexum-test`。
- 需要更新 workspace、package exports、import specifier、Protocol/Client 生成链路和 POC 启动脚本。
- 需要新增文件存储 Adapter 的恢复、原子写入、关闭和损坏文件错误测试。
- 需要保留现有 Session admission、inbox delivery、steer、compaction、execution recovery 和一次 step 一次 `llm.stream` 的语义。
