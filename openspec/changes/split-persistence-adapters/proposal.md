# Proposal

## Why

当前内存、磁盘文件和数据库实现集中在一个持久化包中，运行场景的默认选择不够清晰，也无法让测试在接近真实运行的 SQLite 环境中验证重启后的数据行为。现在拆分适配器包，可以让 CLI、Web/Server 和测试分别选择明确的存储后端，同时保持 Core 与 Application 不依赖具体存储技术。

## What Changes

- 将持久化实现拆分为内存、磁盘文件和 SQLite 三个独立适配器包。
- 保留统一的持久化组合接口，使 Application 可以注入任意适配器组合。
- 将 CLI 的默认持久化方式固定为磁盘文件。
- 将测试模块的默认持久化方式固定为独立的临时 SQLite 数据库。
- 将 Web/Server 的默认持久化方式固定为 SQLite 数据库。
- 保留内存适配器，用于临时运行和需要快速隔离的测试场景。
- 为 SQLite 适配器增加可重复执行的 schema 初始化、重启后恢复和隔离测试能力。

## Capabilities

### New Capabilities

### Modified Capabilities

- `persistence-adapters`: 修改运行场景默认适配器和适配器包边界要求，新增 SQLite 默认行为并保持统一端口语义。

## Impact

- 新增 `packages/nexum-persistence-memory`、`packages/nexum-persistence-file` 和 `packages/nexum-persistence-sqlite`。
- 调整 `packages/nexum-persistence` 的公共组合类型和导出边界。
- 调整 `packages/nexum-application`、`packages/nexum-server`、`packages/nexum-test` 和 `packages/nexum-cli` 的 workspace 依赖与默认 Runtime 组装方式。
- SQLite 数据库文件、schema 初始化和事务边界成为 Server/Web 的本地运行基础设施。
- 现有直接从 `@nexum/persistence` 导入具体实现的调用方需要迁移到对应适配器包。
