# Persistence Adapters

## Purpose

让同一套 Nexum Core/Application 能够按运行场景切换本地文件、进程内存和数据库等持久化实现，并保持 Session、消息历史、权限交互及事件回放的可观察行为一致。

## Requirements

### Requirement: Runtime SHALL accept a complete persistence composition

运行时 MUST 能够接收一组覆盖其持久化能力的组合对象，并通过统一的领域端口访问数据；Core 和 Application 不得根据运行场景直接判断文件、数据库或内存实现。运行时 MUST 为 CLI、测试和 Web/Server 提供明确且稳定的默认持久化方式，同时允许调用方覆盖默认组合。

#### Scenario: CLI uses file persistence

- **WHEN** CLI 创建本地 Runtime 且未显式传入自定义 Store
- **THEN** Session、消息历史、模型配置、权限策略、交互、事件历史、Memory、Skill 注册和 MCP 配置使用同一个本地数据目录下的文件实现

#### Scenario: Test uses SQLite persistence

- **WHEN** 测试模块创建默认 Runtime
- **THEN** 所有被 Runtime 使用的持久化能力使用该测试实例独立的 SQLite 数据库，且测试结束后不会污染其他测试或开发环境数据

#### Scenario: Test uses memory persistence

- **WHEN** 测试创建内存 Runtime
- **THEN** 所有被 Runtime 使用的持久化能力在进程内可用，且不读写本地持久化文件

#### Scenario: Runtime explicitly uses memory persistence

- **WHEN** Core 单元测试或调用方显式创建内存 Runtime
- **THEN** 所有被 Runtime 使用的持久化能力在进程内可用，且不读写本地持久化文件或 SQLite 数据库

#### Scenario: Web uses SQLite persistence

- **WHEN** Web/Server 创建本地 Runtime 且未显式传入自定义 Store
- **THEN** 所有被 Runtime 使用的持久化能力使用同一个 SQLite 数据库文件

#### Scenario: Runtime can use memory persistence

- **WHEN** 调用方显式选择内存 Runtime
- **THEN** 所有被 Runtime 使用的持久化能力在进程内可用，且不读写本地持久化文件或 SQLite 数据库

#### Scenario: Web can replace persistence as a whole

- **WHEN** Web Runtime 注入数据库组合
- **THEN** 应用层只依赖持久化端口，不需要替换或修改 Core 的业务流程

### Requirement: Persistence compositions SHALL preserve port semantics

每种组合实现 MUST 遵守现有 Store/Port 的输入校验、错误语义、幂等行为和 Session 范围；组合层不得复制领域规则或改变单项 Store 的公开契约。

#### Scenario: Session deletion removes related state

- **WHEN** 调用持久化组合删除一个 Session
- **THEN** 该组合能按现有端口语义删除或清理该 Session 关联的消息、交互和事件状态

#### Scenario: Event history supports replay

- **WHEN** 客户端使用 Session 和事件游标重新订阅
- **THEN** 组合提供的事件能力返回游标之后的历史事件，并继续交付后续事件

### Requirement: Credential persistence SHALL remain separately replaceable

模型和 MCP 凭据 MUST 通过独立凭据端口注入；普通配置读取不得暴露凭据明文，CLI 与 Web 可以分别选择本地安全存储和外部密钥存储。

#### Scenario: Safe configuration response

- **WHEN** 读取模型配置或 MCP 配置
- **THEN** 返回的配置只表示凭据是否已配置或引用信息，不直接返回凭据明文

#### Scenario: Web credential backend changes

- **WHEN** Web 从数据库凭据实现切换到密钥管理服务
- **THEN** 不需要修改 Core、Session 或消息持久化代码

### Requirement: SQLite persistence SHALL initialize and recover durable state

SQLite 适配器 MUST 能够在数据库文件首次使用时初始化所需结构，并在进程重启后从同一数据库文件恢复持久化状态。

#### Scenario: First use initializes the database

- **WHEN** SQLite Runtime 使用一个不存在或尚未初始化的数据库文件启动
- **THEN** 适配器创建所需结构并完成 Runtime 初始化，不要求用户手工执行数据库脚本

#### Scenario: Restart recovers persisted state

- **WHEN** Runtime 写入 Session、消息、权限策略或事件后关闭，再使用同一个数据库文件启动
- **THEN** 新 Runtime 能读取关闭前已经成功提交的数据

#### Scenario: Tests use isolated databases

- **WHEN** 两个测试 Runtime 同时或先后使用默认 SQLite 测试工厂
- **THEN** 两个 Runtime 使用不同的数据库位置，任一测试写入的数据都不会出现在另一个测试中
