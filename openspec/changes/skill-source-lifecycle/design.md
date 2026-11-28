# Design

## Context

当前 Skill Registry 已支持配置 root 扫描、地址显式注册、持久化和 `unregister`，但注册记录只有 `sourceType: local-directory`，无法区分 root 所有的内置 Skill 与调用方拥有的外部 Skill。现有 HTTP `DELETE /api/nexum/skills/{id}` 也只有“取消注册”语义，不能安全表达删除内置源目录的需求。

## Goals / Non-Goals

**Goals:**

- 在 Core、Application、Protocol、Server、Client、CLI、Agent 和页面中稳定区分 `builtin` 与 `registered` 来源。
- 让 `unregister` 只作用于外部注册 Skill，并对内置 Skill 返回稳定冲突错误。
- 增加独立的内置源删除操作，只允许删除配置 root 的直接子目录，并在 UI 中经过确认后执行。
- 兼容旧版持久化记录：缺少来源字段时按配置 root 归属推断并在后续写入时升级。
- 为成功/失败、重复请求、路径边界和源目录保留行为补齐测试。

**Non-Goals:**

- 不增加目录监听或后台自动同步。
- 不允许删除配置 root 本身、root 外路径、符号链接 Skill 或外部注册源目录。
- 不改变 Skill 文件内容校验、激活权限和现有事件订阅机制。

## Decisions

### 1. 使用 `sourceKind` 表示所有权

在安全摘要、候选和持久化记录中增加 `sourceKind: "builtin" | "registered"`。保留现有 `sourceType: "local-directory"` 表示物理来源类型，避免把来源所有权混入既有类型字段。

`createLocalSkillSource` 增加 root 归属判断和安全删除能力。Application 负责生命周期决策，Integration 负责 root 边界和文件系统操作。自定义 Source 未实现归属判断时，显式注册地址默认按 `registered` 处理。

备选方案是仅在 Application 中保存地址集合判断 root 归属，但会重复路径安全逻辑并破坏 Source 的边界，因此不采用。

### 2. 保持两个明确的破坏级别

- `unregister(id)`：只允许 `registered`，删除注册记录和派生 Registry 状态，保留源目录。
- `remove(id)`：只允许 `builtin`，通过 `DELETE /api/nexum/skills/{id}/source` 删除 root 下的 Skill 目录，再删除对应 Registry 状态。

内置 Skill 的普通 `DELETE /api/nexum/skills/{id}` 返回 HTTP 409 和 `NEXUM_SKILL_BUILTIN`。外部 Skill 调用 source remove 时返回 `NEXUM_SKILL_SOURCE_NOT_REMOVABLE`，避免误删外部文件。

备选方案是让同一个 DELETE 根据来源自动选择删除方式，但调用方无法从请求本身看出是否会造成文件删除，不满足破坏性操作的可发现性和最小惊讶原则。

### 3. 持久化仍保留启动恢复，但不再改变所有权

首次无持久化数据时，root 发现结果写入带 `sourceKind: builtin` 的记录；显式注册写入 `sourceKind: registered`。启动从记录恢复时保留该字段，并对旧记录按当前配置 root 推断：root 直接子目录归为 `builtin`，其他地址归为 `registered`。

取消注册不会触发重新扫描把内置源重新加入，因为内置源不能通过该操作进入；删除内置目录后，Registry 刷新或下次启动会移除该源。外部取消注册后在 `roots: []` 下保持现有重新注册语义。

### 4. 对所有控制面保持同一契约

Protocol/Client 增加 `sourceKind` 和 `remove` 类型；CLI 增加 `skill remove <id>`；Agent 的 `skill_registry` 增加 `remove`，继续使用 `skill.manage` 权限；页面对内置显示“删除 Skill”，对外部显示“取消注册”。两种 UI 操作都必须确认，且只有成功响应后才从列表移除。

事件新增 `removed` 变化类型；内置 unregister 冲突和删除失败不发布成功事件，成功删除源目录后发布安全的 `skill.updated`。

## Risks / Trade-offs

- [Risk] 删除内置 Skill 是不可逆文件操作。→ 仅允许 root 直接子目录、拒绝符号链接、使用独立 endpoint/CLI/Agent operation，并在 UI 强制确认；测试保留外部源目录。
- [Risk] 旧持久化文件缺少 `sourceKind`。→ 读取时兼容推断，写回时补齐字段；不改变已存在的地址和摘要。
- [Risk] 文件系统和持久化不是同一事务。→ 删除前确认来源和当前 Skill ID，先移除持久化记录；物理删除失败时恢复注册记录并返回稳定错误，恢复失败也不隐藏错误状态。
- [Risk] 自定义 Source 不支持物理删除。→ `remove` 能力保持可选，Application 对不支持的源返回稳定不可删除错误，不执行文件系统旁路。

## Migration Plan

1. 先扩展 Core/Protocol 类型、持久化兼容解析和 Local Source 安全边界。
2. 按 TDD 增加 Registry、Server、Client、Agent、CLI 和 UI 测试，再实现对应行为。
3. 同步 API、能力和 CLI 文档，运行 OpenSpec 校验、包级测试、类型检查和根级 `bun run check`。
4. 旧注册文件无需手工迁移；首次加载时推断，下一次写入时保存新字段。若回滚到旧版本，新字段作为未知 JSON 字段被忽略，不影响地址读取。
