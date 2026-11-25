# Design

## Context

当前 `@nexum/persistence` 同时承载持久化组合类型、内存实现、JSON 文件实现和事件 Hub。Application 通过 `createMemoryPersistence` 与 `createFilePersistence` 选择实现，`@nexum/test` 的 Workbench 也仍然通过文件 Runtime 验证恢复行为。相关约束详见 `proposal.md` 与 `specs/persistence-adapters/spec.md`。

本次改造必须保持 Core 端口语义不变，不能让 Core 依赖任何具体存储包；同时必须兼容 Bun workspace、当前 Application/Server 组装方式以及已有的 Session、消息、权限、Memory、MCP 和事件能力。

## Goals / Non-Goals

**Goals:**

- 将内存、JSON 文件和 SQLite 实现拆成独立 workspace 包。
- 让 `@nexum/persistence` 只保留适配器共同使用的组合契约和共享类型。
- 让 SQLite 通过 Bun 原生 SQLite 能力提供默认数据库实现，不新增 Java 或外部数据库进程依赖。
- 让测试 Runtime 默认使用隔离的临时 SQLite 数据库，验证真实持久化和重启恢复。
- 让 CLI 使用文件 Runtime，Web/Server 使用 SQLite Runtime。
- 让三种实现覆盖同一组 Core 端口，并保留显式注入完整 Persistence 组合的能力。
- 为数据库初始化、事务、重启恢复和测试隔离建立自动化验证。

**Non-Goals:**

- 本次不引入 PostgreSQL、MySQL 或远程数据库适配器。
- 本次不改变 Core 端口的业务语义、HTTP 协议或 Session 生命周期协议。
- 本次不把 CLI 改造成直接操作数据库；CLI 仍通过 Server 访问运行时。
- 本次不做历史 JSON 数据的自动迁移工具；文件适配器继续保留，迁移工具另行设计。

## Decisions

### 1. 保留公共契约包，按后端拆分实现包

保留 `@nexum/persistence` 作为 `NexumPersistence`、事件 Hub 端口、文件/SQLite 选项和共享组合工具的契约包；新增：

- `@nexum/persistence-memory`：内存 Store 与内存事件 Hub。
- `@nexum/persistence-file`：JSON 文件 Store 与文件事件 Hub。
- `@nexum/persistence-sqlite`：SQLite Store 与 SQLite 事件 Hub。

三个实现包只依赖 `@nexum/core` 和 `@nexum/persistence`，不依赖 Application 或 Server。Application 依赖三种适配器包并负责运行场景选择。这样可以替换单个后端而不改变 Core，也不会把数据库细节泄漏到领域层。

备选方案是保留所有实现于一个包中，或把三种实现直接放入 Application。前者无法形成清晰的安装和依赖边界，后者会让编排层承担存储实现细节，因此不采用。

### 2. SQLite 使用单文件数据库与统一存储表

SQLite 适配器使用 `bun:sqlite` 打开一个数据库文件，并在打开时执行幂等 schema 初始化。Session、消息、交互、模型配置、角色提示词、权限策略、Memory、Skill、MCP 配置和凭据各自使用明确的 namespace；可枚举对象以 `id + JSON payload` 保存，事件使用带 session、sequence 和 eventID 索引的事件记录。

这保留现有端口输入输出，同时避免为每个 Store 引入不同的 ORM。单项 Store 的写入通过 SQLite 事务完成；跨 Store 的组合写入只在当前调用边界内建立明确事务，不在事务中执行模型或外部 MCP 调用。

备选方案是为每个 Store 建完整关系表，查询效率更好但本次需要维护大量迁移和字段映射；或者继续使用 JSON 文件，无法满足测试默认 SQLite 和并发写入要求。因此本次采用 JSON payload + 受控索引的渐进方案。

### 3. 默认 Runtime 按场景显式选择

- `createEmbeddedRuntime` 默认使用 `createMemoryPersistence`，适合显式嵌入和临时运行。
- `createLocalRuntime` 默认改为 `createFilePersistence`，保留 `dataDirectory` 和各文件覆盖选项，满足 CLI 本地文件场景。
- 增加 SQLite Runtime 工厂或等价的 `persistenceBackend: "sqlite"` 选择，Web/Server 默认使用 `.nexum/nexum.db`。
- `@nexum/test` 提供测试 Runtime 工厂，默认为每个测试创建临时 SQLite 文件；现有 POC 改用数据库断言，不再依赖 JSON 文件名。

Server 的默认入口改为 SQLite，但传入显式 `runtime` 或 `persistence` 时保持调用方选择。CLI 本身是 HTTP Client，不直接拥有 Store；其本地服务默认通过 Server 使用文件 Runtime。

### 4. 测试隔离使用临时数据库路径

测试工厂在临时目录生成唯一数据库路径，并在 `afterEach` 或 Runtime 关闭后删除数据库和 SQLite 辅助文件。测试不共享开发目录、不使用固定数据库文件，也不依赖执行顺序。内存实现保留给不需要持久化语义的 Core 单元测试。

### 5. 兼容策略

先增加独立包并迁移 Application、Server、Test 的导入，再收窄旧 `@nexum/persistence` 的公开实现导出。公共 Store 接口和 `NexumPersistence` 字段不变；如果必须移除旧导出，提供同一版本内的明确迁移导出或在仓库内一次性更新全部调用方。新增 workspace 包的 package.json、lockfile 和测试必须同步更新。

## Risks / Trade-offs

- [SQLite payload 缺少复杂查询索引] → 本次为 Session、消息、事件和常用列表字段建立必要索引；复杂查询保持 Store 内受控扫描，后续按真实负载增加迁移。
- [SQLite 写入竞争导致锁错误] → 设置合理 busy timeout，所有写操作走短事务和单连接串行化；增加并发写入测试，避免在事务内等待外部调用。
- [旧 JSON 数据不会自动进入 SQLite] → 文件适配器继续作为兼容方案，并在文档中明确迁移边界；自动迁移另立 change。
- [凭据落入 SQLite 明文] → 沿用现有凭据端口的脱敏读取语义；数据库文件权限设为用户可读写，日志和 API 不返回凭据明文。
- [测试数据库清理失败留下临时文件] → 使用唯一临时目录、关闭 Runtime 后清理，并在测试失败时保留错误信息而不复用路径。
- [Application 直接依赖三个适配器包扩大启动依赖] → 适配器实现保持轻量，SQLite 使用 Bun 内置模块；后续若需按部署裁剪可再提取 Runtime 选择层。

## Migration Plan

1. 在独立任务分支中创建公共契约、内存、文件和 SQLite workspace 包。
2. 先迁移内存和文件实现，保持现有 CLI/Server 行为可运行。
3. 添加 SQLite schema、Store、事件回放和数据库恢复测试。
4. 将 Server/Web 默认切换到 SQLite，将 Test Workbench 和自动化 POC 切换到临时 SQLite。
5. 运行各受影响包测试、类型检查、根目录检查和 OpenSpec 验证。
6. 若 SQLite 切换出现问题，可通过显式传入文件 Runtime 回滚默认行为；现有 JSON 文件不会被删除或覆盖。

## Open Questions

无。默认适配器和运行场景已经由需求确认，数据库技术选择为 SQLite。

