# Proposal

## Why

当前 Registry 将配置 `roots` 自动发现的内置 Skill 与通过地址显式注册的外部 Skill 都保存为同一种注册记录，导致两类来源无法拥有正确的生命周期。内置 Skill 应由 root 目录作为事实来源，外部 Skill 才由 Nexum 注册记录管理。

## What Changes

- 区分 `roots` 自动发现的内置 Skill 与地址显式注册的外部 Skill。
- 内置 Skill 不允许执行普通 `unregister`，其生命周期由 root 下的目录决定。
- 外部 Skill 取消注册时只删除 Nexum 注册记录和派生 Registry 状态，不删除源目录。
- 避免将 root 自动发现结果当作外部注册记录持久化，防止取消注册后被重新发现。
- 更新 HTTP、Client、CLI、Agent 工具和页面交互，使内置 Skill 的取消注册返回稳定冲突错误，外部 Skill 保持现有取消注册语义。
- 增加内置与外部来源的 API 摘要字段，并同步中英文 API/能力文档。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `headless-skill-registry`: 修改 Skill 来源归属、发现、持久化和取消注册规则。
- `headless-skill-control`: 修改管理 API、Agent 工具和页面对内置/外部 Skill 的生命周期行为。

## Impact

- Core/Application：Skill 来源类型、Registry 状态和注册存储边界。
- Server/Protocol/Client：安全摘要字段、取消注册错误契约和生成客户端同步。
- CLI/UI/Agent：按来源显示或拒绝取消注册操作。
- Tests/Docs：补充内置与外部 Skill 的生命周期、冲突、持久化和交互覆盖。
- 不删除源目录，不新增第三方依赖。
