# Spec Delta

## Purpose

让同一套 Nexum Core/Application 能够按运行场景切换本地文件、进程内存和数据库等持久化实现，并保持 Session、消息历史、权限交互及事件回放的可观察行为一致。

## ADDED Requirements

### Requirement: Runtime SHALL accept a complete persistence composition

运行时 MUST 能够接收一组覆盖其持久化能力的组合对象，并通过统一的领域端口访问数据；Core 和 Application 不得根据运行场景直接判断文件、数据库或内存实现。

#### Scenario: CLI uses file persistence

- **WHEN** CLI 创建本地 Runtime 且未显式传入自定义 Store
- **THEN** Session、消息历史、模型配置、权限策略、交互、事件历史、Memory、Skill 注册和 MCP 配置使用同一个本地数据目录下的文件实现

#### Scenario: Test uses memory persistence

- **WHEN** 测试创建内存 Runtime
- **THEN** 所有被 Runtime 使用的持久化能力在进程内可用，且不读写本地持久化文件

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
