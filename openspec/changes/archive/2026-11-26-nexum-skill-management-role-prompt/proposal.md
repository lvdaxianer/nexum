# Proposal

## Why

Nexum 当前能够扫描并激活 Skill，但注册源不是持久化的一等对象，服务重启后无法可靠恢复，API 也缺少按地址注册和取消注册能力。会话 Agent 没有明确的 Nexum Skill 管理工具，容易退回到 shell 搜索工作区；同时全局默认角色提示词没有独立的持久化和上下文注入契约。

## What Changes

- 将 Skill 注册改为按地址管理，支持注册、详情、刷新、校验、激活和取消注册。
- 将注册源和安全状态持久化到 Nexum 数据目录，启动时恢复并刷新。
- 保持注册幂等和重复 Skill ID 冲突保护；取消注册只移除 Nexum 注册，不删除用户源文件。
- 扩展 Headless API、客户端、能力声明和事件，使 Skill 管理契约完整且可观察。
- 在 Session Agent 中提供 `skill_registry` 管理工具，明确禁止用 shell 搜索或猜测 Skill 注册位置。
- 在 Web UI 中提供地址注册、刷新、校验、取消注册和状态反馈。
- 新增独立的默认角色提示词配置、持久化、读取/保存/恢复 API 和 UI 编辑入口。
- 在每次模型调用的 system context 中注入默认角色提示词；Nexum 不翻译、重写或后处理模型思考和输出。
- **BREAKING**：Skill 注册入口从按 `id` 请求调整为按 `address` 请求；旧的仅按 ID 注册语义不再作为注册源依据。

## Capabilities

### New Capabilities

- `default-role-prompt`: 管理全局默认角色提示词，并将其作为 system context 注入模型调用。

### Modified Capabilities

- `headless-skill-registry`: 增加按地址持久化注册、启动恢复、刷新和取消注册行为。
- `headless-skill-control`: 增加完整 Skill 管理 API、Agent 管理工具、UI 操作和注册状态事件。

## Impact

- 影响 `packages/nexum-core`、`packages/nexum-adapters`、`packages/nexum-protocol`、`packages/nexum-server`、`packages/nexum-client` 和 `packages/nexum-surfaces`。
- 新增 Nexum 数据目录中的 `skills.json` 和 `role-prompt.json` 文件配置。
- 需要更新客户端生成物、协议类型、能力声明、权限映射和 Skill 相关测试。
- 需要使用真实本地服务和浏览器会话验证 `metric-view-lifecycle` 的注册、持久化、激活和取消注册流程。
