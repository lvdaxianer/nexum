# Proposal

## Why

当前 Runtime 在应用层逐个拼装 Session、Message、模型配置、事件、权限等 Store，CLI 的文件持久化与测试内存实现可以工作，但 Web 数据库场景没有统一替换边界。需要把这些能力收敛成可注入的持久化组合，使 CLI 使用本地文件、Web 使用数据库、测试使用内存，同时保持 Core 不依赖具体存储实现。

## What Changes

- 新增统一的持久化组合端口，集中承载现有 Store/Port 能力。
- 提供 File、Memory 两套组合适配器，并保留现有单项 Store 的行为和兼容入口。
- 让 Local Runtime 和 Embedded/Test Runtime 通过组合适配器完成依赖注入。
- 预留 Database 组合适配器的实现边界，不在本次引入具体数据库驱动。
- 明确事件回放、凭据存储和 Skill 注册状态属于组合适配器的能力范围。

## Capabilities

### New Capabilities

- `persistence-adapters`: 为不同运行场景提供可替换、可组合的持久化实现。

### Modified Capabilities

## Impact

- 影响 `packages/nexum-application` 的 Runtime 组装方式。
- 影响 `packages/nexum-persistence` 的公开导出和组合实现。
- 不改变 Core 的领域语义，不新增外部数据库依赖，不修改现有 HTTP API。
- 为后续 Web 数据库适配器、凭据管理和多实例事件广播提供稳定边界。
