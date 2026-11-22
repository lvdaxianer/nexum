# Proposal

## Why

Nexum 当前已经具备 Core、Protocol、Server 和参考界面的雏形，但默认存储、模型、Host、Tools、Skills 和部分 Runtime 语义仍与 Core 交织，无法被不同宿主独立替换。POC 如果只使用内存存储，也无法证明真实 Session、事件恢复和页面重启后的持久化链路，因此现在需要把默认实现下沉到 Adapter，并用文件持久化的可运行 Test Workbench 验证完整能力。

## What Changes

- **BREAKING** 将默认能力从 `@nexum/core` 迁移到 `@nexum/adapters`，Core 只保留领域语义、Port、Agent Loop 和 Runtime 生命周期。
- **BREAKING** 将交互接入包从 `nexum-ui` / `@nexum/ui` 更名为 `nexum-surfaces` / `@nexum/surfaces`，为 Web、TUI、CLI、Desktop、Headless 等场景保留扩展空间。
- 将默认 Session、Message、Interaction、Model Config、Permission、Event、Memory、Model、Host、Tools、Skills 和 MCP 实现归入 Adapter。
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

- 受影响目录：`packages/nexum-core`、`packages/nexum-adapters`、`packages/nexum-protocol`、`packages/nexum-client`、`packages/nexum-server`、`packages/nexum-surfaces`、`packages/nexum-test`。
- 需要更新 workspace、package exports、import specifier、Protocol/Client 生成链路和 POC 启动脚本。
- 需要新增文件存储 Adapter 的恢复、原子写入、关闭和损坏文件错误测试。
- 需要保留现有 Session admission、inbox delivery、steer、compaction、execution recovery 和一次 step 一次 `llm.stream` 的语义。
