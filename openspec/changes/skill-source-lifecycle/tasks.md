# Tasks

## 1. Registry 来源与文件系统边界

- [x] 1.1 扩展 Core Skill 类型和持久化兼容解析，增加 `sourceKind`、内置冲突错误和 `remove` 端口；先为内置/外部混合列表、旧记录推断、外部取消注册保留源目录、内置取消注册拒绝和重新注册编写失败测试，再实现并运行 `packages/nexum-core` 测试与类型检查。
- [x] 1.2 扩展 Local Skill Source 的 root 归属判断和安全删除能力，先覆盖 root 直接子目录可删除、root 本身/root 外/符号链接不可删除的失败测试，再实现并运行 integrations/application 相关测试。
- [x] 1.3 重构 Application Registry 的发现、持久化、取消注册和内置删除生命周期，确保旧记录升级、内置来源不被重新当作外部注册、删除后从列表消失；运行 Registry 单测并核对持久化 JSON。

## 2. Headless 控制面与调用方

- [x] 2.1 扩展 Protocol、Server 和 Client 的 `sourceKind`、`remove`、稳定错误与 `removed` 事件契约，先补 HTTP/Client 失败测试，再实现并运行 `packages/nexum-server`、`packages/nexum-client` 测试和类型检查。
- [x] 2.2 扩展 Agent `skill_registry` 和 CLI 的 `remove` 操作与权限映射，覆盖外部 unregister、内置冲突和内置删除的真实调用链；运行 application/core/cli 测试。

## 3. 页面交互与文档

- [x] 3.1 更新页面 Skill 列表按来源显示“取消注册”或“删除 Skill”，为内置删除增加确认和失败恢复，覆盖重复点击、成功后移除、失败保留行和源目录保留；运行 `packages/nexum-surfaces` 相关 Playwright 测试。
- [x] 3.2 同步中英文 Skill 能力文档、HTTP API 文档和 CLI 帮助，说明来源字段、两个 DELETE/命令语义、错误码和删除边界；运行文档链接与格式检查。

## 4. 集成验证

- [x] 4.1 运行 OpenSpec validate、受影响包测试和类型检查，确认内置/外部生命周期场景全部覆盖。
- [x] 4.2 运行根目录 `bun run check`，完成代码审查、计划一致性审计和工作树差异核对。

## Workflow follow-up

- 通过每个任务的 RED/GREEN、审查和 per-task audit 后，按项目 Conventional Commit 规则提交并合并回 `SOURCE_BRANCH`。
- 完成最终审计后归档 `skill-source-lifecycle` OpenSpec change，并验证归档结果。
