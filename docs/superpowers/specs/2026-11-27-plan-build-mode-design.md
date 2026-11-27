# Plan / Build Agent 模式设计

## 背景

当前 Nexum Runtime 只有统一的 Coding Loop 和权限审批模式，没有原版 OpenCode 的 Plan / Build Agent 模式。权限模式只能控制审批策略，不能保证 Agent 在计划阶段不修改业务代码或执行命令。本设计为 Session 增加持久化的 Agent 模式，并让 Core 在工具执行边界强制执行模式约束。

## 目标

1. Session 默认使用 `build` 模式，兼容现有 Session 文件和调用方。
2. `plan` 模式允许读取项目并写入专用 `.nexum/plans/` 计划文件，禁止修改其他文件、执行 Shell、调用 MCP 或管理 Skill。
3. `build` 模式保留现有工具和权限行为。
4. 通过公开 API 和 UI 切换模式；运行中的 Session 不允许切换。
5. 模式限制由 Core 强制执行，不能被自定义 Client、提示词或已保存的权限规则绕过。

## 非目标

- 不实现完整的 OpenCode Agent 注册系统或自定义 Agent。
- 不把 Plan / Build 与现有 `ask / balanced / full` 权限审批模式合并。
- 不在本次变更中新增独立的 Plan 文件数据库；计划文件使用 Session 工作目录下的普通文件存储。
- 不允许 Plan 模式执行任意命令后再依赖模型自律清理结果。

## 方案

### 1. 领域模型和持久化

Core 新增 `NexumAgentMode = "plan" | "build"`。`SessionRecord` 增加 `mode` 字段，创建时可选输入 `mode`，缺省为 `build`。Session Store 读取旧记录时把缺失或无效的模式迁移为 `build`；File、Memory、SQLite Store 都只持久化这个字段，不改变现有删除和排序语义。

Session Service 新增 `setMode(sessionID, mode)`。它复用现有按 Session 串行队列，检查 Session 存在和当前状态；`running` 时返回 `session_busy`，重复设置同一模式幂等，成功后更新时间戳。模式切换不会修改消息历史。

### 2. Core 执行边界

Coding Loop 每次取到 Session 后读取当前模式，并在每次模型请求前生成模式可用工具集：

- `build`：保留完整工具定义和现有 PermissionPort 判定。
- `plan`：只向模型暴露 `read`、`write`、`edit` 和只读 Skill 查询工具；不暴露 `shell`、MCP 和 Skill 管理工具。

即使模型返回了未暴露的工具调用，Core 仍在 PermissionPort 之前拒绝：`read` 允许，`.nexum/plans/` 下的 `write/edit` 允许，其他调用返回稳定的 `plan_mode_restricted` 错误，不调用 Host、MCP 或 Skill Registry。计划文件路径只能是相对工作目录的 `.nexum/plans/` 子路径，避免绝对路径和路径穿越成为绕过点。

Plan 模式临时注入系统上下文，明确当前模式、禁止的操作和当前 Session 的计划文件路径 `.nexum/plans/<sessionID>.md`。该上下文不写入 canonical history，切换到 Build 后的下一次模型调用自然使用 Build 能力。

### 3. Protocol、Server 和 Client

Protocol 的 `NexumSession`、`NexumSessionState` 和相关输入类型公开 `mode`。Server 的 Session 创建响应和所有 Session 查询响应返回模式；新增 `PUT /api/nexum/session/:id/mode` 子资源接口更新模式，保留现有名称更新接口兼容性。

Server 对 `mode` 做枚举校验，运行中切换返回 409 `NEXUM_SESSION_RUN_CONFLICT`，不存在的 Session 返回 404，其他失败使用现有 caller-safe 错误结构。Client 暴露 `session.setMode({ sessionID, mode })`，使用同一子资源契约。

### 4. Surface 交互

聊天输入区新增 Plan / Build 模式切换控件，显示当前模式和简短说明。点击后立即进入 pending，禁止重复点击；成功后增量更新当前 Session 的稳定列表项、提示成功并保持聊天内容；失败时恢复原模式、保留当前 Session 和错误信息。运行中的 Session 禁用切换，并通过 `session.status` 给出原因。

Session 切换、刷新和创建时以服务端返回的 `mode` 为准。Plan 模式显示计划提示和计划文件位置，Build 模式显示执行提示。权限设置仍独立保留，不用权限芯片冒充 Agent 模式。

## 错误和恢复

- 未知模式由 Server 和 Core 的边界校验拒绝。
- 旧持久化记录缺失模式时安全回退到 `build`。
- Plan 模式工具限制在 Core 重复校验，不能通过绕过 UI 或自定义权限规则解除。
- 切换请求失败时 UI 不做乐观持久化；只恢复按钮状态和显示可重试错误。
- 正在运行时不杀掉当前执行，也不改变本轮已解析的模式；请求直接返回冲突。

## 测试策略

- Core Session 测试覆盖默认模式、旧记录迁移、幂等切换、运行中拒绝和更新时间。
- Core Coding Loop 测试覆盖 Plan 模式工具过滤、绕过模型工具列表的拒绝、计划文件路径允许、业务文件/Shell/MCP/Skill 管理拒绝，以及 Build 模式回归。
- Persistence 测试覆盖 File、SQLite 和内存记录的模式读写与旧记录迁移。
- Server 测试覆盖创建/查询/更新模式、校验、404、409 和稳定错误响应。
- Client 测试覆盖可选 mode 的请求体和返回解析。
- Surface 测试覆盖模式显示、切换 pending/成功/失败、运行中禁用和 Session 切换同步。

## 验收标准

1. 新建 Session 默认显示并持久化为 Build。
2. Plan 模式下 Agent 可以读代码和写 `.nexum/plans/<sessionID>.md`，不能修改其他文件或执行命令。
3. 直接调用 API、模型返回隐藏工具名或已有权限规则都不能绕过 Plan 限制。
4. 用户可以在空闲/终态 Session 中切换 Plan 与 Build，运行中切换得到明确冲突提示。
5. 刷新页面、重启 Runtime 后模式保持一致。
6. 受影响包测试、类型检查和根目录 `bun run check` 通过。
