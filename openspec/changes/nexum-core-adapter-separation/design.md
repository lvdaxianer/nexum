# Design

## Context

Nexum 的第一阶段迁移已经建立了 `@nexum/*` 包入口，但 Core 中仍保留大量默认实现。当前目标不是再增加一个入口，而是建立可替换的最小功能单元，并用一个真实持久化的 POC 工作台证明从执行语义到呈现面的完整组合。

## Goals / Non-Goals

**Goals:**

- Core 不直接依赖文件、进程、网络、OpenAI-compatible、MCP transport 或具体持久化实现。
- Application 提供 embedded 和 local 两种组合；local 默认使用 `.nexum` 文件持久化。
- `@nexum/test` 的 POC 默认使用独立 `.nexum-test` 目录，不使用内存作为真实运行时存储。
- Server 只消费 Runtime；Protocol 只定义 wire contract；Surfaces 只负责场景化交互映射。
- 允许以后增加 `@nexum/surfaces/web`、`/tui`、`/cli`、`/desktop`、`/headless`，而不修改 Core。

**Non-Goals:**

- 本变更不实现分布式 Session ownership、集群调度或 exactly-once 执行。
- 本变更将按职责拆成 Persistence、Integrations 和 Application 三个私有 workspace 包，不保留旧聚合包。
- 本变更不把 UI 框架组件放入 Protocol 或 Core。
- 本变更不要求 POC 默认连接真实模型；Fake Model 只替换 ModelPort，不能替换持久化、Protocol 或 Surface 链路。

## Decisions

### 1. Core 只接收显式依赖

Core 的 Coding Loop、Session Service 和 Runtime 通过显式参数接收 Model、Tools、Permission、Session、Message、Event、Context、Question、Skill、Memory 和 MCP Port。缺少必需 Port 时在构造或 start 阶段返回稳定配置错误，不创建 fallback。内存/文件实现由 Persistence 提供。

### 2. 文件持久化是 POC 的默认运行时

`@nexum/test` 使用 `createLocalRuntime({ dataDirectory })`，默认数据目录为工作树下的 `.nexum-test/`。Session、Message、Interaction、Model Config、Permission Policy、Event 和 Memory 分别拥有持久化文件；写入使用临时文件加 rename，读取损坏时返回稳定错误而不是静默重置为空。

### 3. Test 模块分为自动化入口和 Workbench 入口

自动化入口验证领域行为和 Protocol envelope；Workbench 入口启动本地页面。页面使用同一份文件 Runtime 和同一份 Client/Surface 映射，不维护另一套演示状态。Fake Model 产生确定性文本、反问和完成事件。

### 4. Surface 代替 UI

`@nexum/surfaces` 不承诺某种渲染技术，只提供交互呈现模型和各场景 Adapter。Web POC 可以使用现有 Solid/Vite 参考实现，但 Web 不是 Core 或 Protocol 的依赖。

### 5. Server 只绑定协议

Server 接受 `NexumRuntime`，将 HTTP/SSE request/response/event 映射到 Protocol。Local Runtime 的创建属于应用入口或 Test Workbench，不由 Server 隐式创建默认存储。

## Dependency Graph

```text
@nexum/core
  └── pure contracts + execution semantics

@nexum/persistence ─────> @nexum/core
@nexum/integrations ────> @nexum/core
@nexum/application ─────> @nexum/core + @nexum/persistence + @nexum/integrations
@nexum/protocol            schema / wire contract only
@nexum/client ───────────> @nexum/protocol
@nexum/server ───────────> @nexum/core + @nexum/application + @nexum/protocol
@nexum/surfaces ─────────> @nexum/client
@nexum/test ─────────────> core + application + persistence + integrations + protocol + client + surfaces
```

`@nexum/test` 只能是 test/dev 组合包，任何生产包不得依赖它。

## Recovery and Lifecycle

- Local Runtime 启动时先创建目录、恢复文件存储、加载事件和 Session projection，再开放 Prompt。
- 单个文件写入采用临时文件加 rename，失败保留原文件并返回稳定错误。
- POC 重启后从同一 `.nexum-test` 目录读取 Session、Message、Event 和 Interaction。
- Runtime `close()` 幂等，关闭后拒绝新的 Prompt；已连接的事件流发送终态。
- POC 结束时不删除数据目录，测试只使用明确的临时目录并在测试 teardown 后清理。

## Risks / Trade-offs

- 物理迁移会暂时留下重复路径：通过边界测试禁止 Core 继续导出具体实现，完成一组迁移后立即删除旧出口。
- 文件存储不等于生产数据库：POC 只验证持久化和恢复语义，未来可替换为 SQLite/远程 Store。
- 浏览器页面依赖 Bun/Vite：页面只作为 Surface 参考实现，Core 和 Protocol 测试不依赖 DOM。
