# Proposal

## Why

当前 Runtime 以独立 Skill 和工具调用为主要扩展入口，无法把一个包含多个 Skill、Function、Workflow 和生命周期 Hook 的领域能力作为统一入口加载。客服、售后等非 Coding 场景需要通过 `@plugin` 或自然语言自动路由激活领域能力，同时保持内部能力不暴露为独立的用户命令。

## What Changes

- 引入可发现、可校验、可激活、可卸载的 Plugin Runtime。
- 将 Plugin 与独立 Skill 都作为顶层可命中的能力注册项。
- 支持 `@<plugin-id>` 显式激活 Plugin；激活默认不执行有副作用的业务动作。
- 支持通过 Plugin Manifest 的描述、意图、示例和关键词进行自然语言自动路由。
- 让 Plugin 在激活后注册内部 Skill、Function、Workflow 和生命周期 Hook。
- 禁止通过 `@` 直接命中 Plugin 内部 Skill 或 Function；内部能力只由模型、Router 或 Workflow 选择。
- 复用现有 Permission、Session、Tool 和 Event 边界，禁止 Plugin 绕过运行时安全控制。
- 为 Plugin 生命周期、激活结果和失败诊断提供稳定的 Core 契约。

## Capabilities

### New Capabilities

- `headless-plugin-runtime`: 管理 Plugin Manifest、发现与激活、显式和自然语言路由、内部能力挂载、生命周期和安全边界。

### Modified Capabilities

<!-- No existing requirement changes are required for the first Plugin contract. -->

## Impact

- Core：新增 Plugin Registry、Plugin Activation 和 Plugin Routing 契约，并接入现有 Session、Skill、Tool 和 Permission 边界。
- Application：提供 Plugin 来源、Loader、运行时组合和自然语言路由实现。
- Protocol/Server/Client：后续暴露 Plugin 列表、详情、激活、停用及生命周期事件时需要同步更新公共契约和生成客户端。
- Tests：增加 Plugin Manifest 校验、显式 `@plugin`、自然语言路由、懒加载、权限、卸载和内部能力可见性测试。
- 非目标：本变更不实现客服 Case、人工任务、SLA 或完整业务 Workflow 引擎；Plugin 只提供这些能力的扩展边界。
