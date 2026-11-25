# Design

## Context

参见 `proposal.md`。当前 `packages/nexum-application/src/index.ts` 直接创建多个文件或内存 Store，`packages/nexum-persistence` 已有单项实现，但没有统一的组合对象。现有 Core 已通过 `SessionStore`、`MessageStore`、`NexumModelConfigStore`、`NexumInteractionStore`、`NexumPermissionPolicyStore`、`MemoryPort`、`EventSink`、Skill 注册 Store 和 MCP Store 等端口隔离领域逻辑。

## Goals / Non-Goals

**Goals:**

- 提供一个可注入的持久化组合，覆盖当前 Runtime 实际需要的持久化能力。
- 将 File 和 Memory 的组装逻辑移出 Runtime 主流程，保持现有公开创建函数兼容。
- 为 Database 适配器定义稳定的组合边界，但不绑定数据库厂商。
- 保留事件历史回放和凭据隔离的独立语义。

**Non-Goals:**

- 本次不实现 SQL schema、迁移脚本或具体数据库驱动。
- 本次不引入 Redis/NATS 等分布式事件总线。
- 本次不改变 HTTP API、Session 状态机或 Core 业务规则。
- 本次不把本地 Skill 来源改造成对象存储来源。

## Decisions

### 组合对象而不是每个 Store 一个 Runtime 参数

新增持久化组合类型，由组合对象暴露当前 Runtime 所需的 Store/Port。File、Memory 和未来 Database 都实现同一组合边界。这样可以避免应用层继续维护一长串逐项默认值，同时仍让单项 Store 可单独注入测试替身。

备选方案是继续在 `NexumRuntimeOptions` 暴露全部 Store，优点是改动小，缺点是场景组装重复且容易漏注入；不选择它作为长期边界。

### 组合层只负责装配，不复制领域逻辑

组合适配器只创建和返回已有端口实现。Session 删除级联、权限判定、事件游标等语义仍由现有 Store/Core 负责；数据库实现未来必须在对应端口内部保证事务和并发约束。

### 事件与凭据保留独立能力

事件 Hub 同时承担历史回放和实时订阅，不能简单等同于普通 CRUD Store；凭据也不能和普通模型配置耦合。组合对象可以持有它们，但不把它们合并成一个数据表或一个公开端口。

### Runtime 提供场景化工厂

保留 `createLocalRuntime` 和 `createEmbeddedRuntime` 作为兼容入口，并让它们内部调用 File/Memory 组合工厂。未来 Web 只需要把 Database 组合传入同一 Runtime 编排流程，不新增一套 Core。

## Risks / Trade-offs

- [Risk] 组合对象可能掩盖某个能力未实现。→ 创建组合时对 Runtime 必需端口做显式校验，并用组合契约测试覆盖。
- [Risk] 未来数据库实现需要跨表事务。→ 事务边界留在 Database 端口实现内，不让 Core 依赖通用事务对象。
- [Risk] 多实例 Web 的实时事件无法只靠单进程 Hub。→ 本次保留 `EventHub` 端口；多实例部署时再增加独立 EventBus 适配器。
- [Risk] CLI 文件凭据仍可能落盘。→ 继续使用独立凭据端口，后续可替换为系统 Keychain，不把凭据字段扩散到业务对象。

## Migration Plan

1. 新增组合类型及 File/Memory 工厂。
2. 将现有 Local/Embedded Runtime 默认组装迁移到组合工厂。
3. 为组合工厂增加持久化契约测试，并运行现有包级和全量检查。
4. 后续实现 Database 组合时，只新增数据库端口实现和 Web 组装入口，不修改 Core。

## Open Questions

无。本次明确不实现具体数据库和多实例事件总线。
