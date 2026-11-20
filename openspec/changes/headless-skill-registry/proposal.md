# Proposal

## Why

当前 Headless Runtime 已经具备 coding loop、权限、Question、上下文压缩和页面控制能力，但还不能发现、注册或调用目录型 Skill。`metric-view-lifecycle` 已经包含 `SKILL.md`、references、scripts 和 evals，若只复制到开发机全局目录，页面运行时和其他部署环境无法复现。

## What Changes

- 在项目内建立可复现的 Skill Registry，完整管理目录型 Skill 包及其文件清单、版本和内容摘要。
- 为 Headless Core 增加 Skill 扫描、注册、校验、列表、详情和安全路径解析能力。
- 为 Session Prompt 增加 `@<skill-id>` 解析和显式 Skill attachment，并把 Skill 指令注入当前 Session。
- 为 Skill 激活复用 `skill.use` 权限、取消和错误恢复边界；不把凭据或真实连接信息写入 Skill 内容、DOM、事件或日志。
- 暴露 Headless API 和页面控制组件，支持注册/刷新、列表、详情、`@skill` 自动补全、激活和本地验证结果。
- 将 `metric-view-lifecycle` 的完整目录作为受控项目资源接入，并用其自带本地测试作为验收证据。

## Capabilities

### New Capabilities

- `headless-skill-registry`: 可复现、可校验、受安全路径约束的目录型 Skill 注册和发现。
- `headless-skill-invocation`: Session 内 `@skill` 解析、指令注入、权限隔离、取消和生命周期事件。
- `headless-skill-control`: Headless API/UI 对 Skill 的管理、激活和本地验证控制。

### Modified Capabilities

- None.

## Impact

- 新增项目资源目录 `skills/metric-view-lifecycle/`，保留上游 Skill 的完整配套文件。
- 修改 `packages/headless-core`、`packages/headless-server`、`packages/protocol`、生成客户端和 `packages/headless-ui`。
- 新增 Headless API 文档和 Core/Server/UI 测试。
- Skill 验证默认只运行本地声明的测试，不注入 Token、不连接真实数据库、不执行保存或发布；真实业务接口仍必须经过现有 Permission 和用户授权。
