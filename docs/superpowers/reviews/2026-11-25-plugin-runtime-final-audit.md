# Plugin Runtime 最终审计

日期：2026-11-25  
集成分支：`dev-v0.0.1-feature-plugin`  
OpenSpec：`plugin-runtime`

## 计划-实现一致性

- 1.1–1.2：Core 已提供安全 Manifest/Registry、显式 `@plugin`、自然语言唯一候选路由和稳定错误契约。
- 2.1–2.2：Application 已提供 Manifest 扫描、入口懒加载、Session active scope、mount/unmount 和诊断。
- 3.1–3.2：显式与自然语言触发均汇聚到同一激活端口，Plugin 内部路径不作为独立用户 mention。
- 4.1–4.2：内部工具按 `plugin__<pluginID>__<tool>` 命名并隔离 Session；Permission、Tool、Event 和停用边界已覆盖。
- 5.1–5.2：Protocol、Server 和 Client 已同步列表、详情、激活、停用、稳定错误码和生命周期事件。
- 6.1：CRM Fixture 与使用/API 文档已提交，覆盖 Skill、Function、Workflow、Hook、`@crm`、自然语言、权限和生命周期。
- 6.2：本审计、全量测试、根检查、OpenSpec 严格校验和全量 diff 检查均通过。

## 安全与边界审计

- 未激活 Plugin 不执行入口模块，列表/详情不暴露入口路径、宿主绝对路径、凭据或实现内容。
- Plugin 激活前复用 PermissionPort；拒绝时不会加载或挂载入口。
- 内部工具只在所属 Session 的 active scope 中可见，停用后不再进入模型工具列表，也不能执行。
- Server 错误返回稳定 `errorCode`，不透传动态入口、文件系统或内部异常文本。
- Protocol/Client/Server 依赖方向保持不变；未出现对 UI 包的反向依赖。

## 验证证据

- `openspec validate plugin-runtime --strict`：通过。
- `cd packages/nexum-core && bun test`：169 pass。
- `cd packages/nexum-application && bun test`：27 pass。
- `cd packages/nexum-protocol && bun test`：7 pass。
- `cd packages/nexum-server && bun test`：79 pass。
- `cd packages/nexum-client && bun test`：9 pass。
- `bun run check`：14/14 packages successful。
- `git diff --check`：通过。
- 文档 Prettier check：通过。

## OpenSpec 归档决策

`openspec/specs/` 当前没有对应的 Plugin 主规格，变更目录包含唯一 delta spec；本次归档不执行主规格同步，保留完整 proposal/design/spec/tasks 到归档目录。

最终结论：Plugin Runtime 变更已完成，满足计划范围，可归档并合并到 `dev-v0.0.1-feature-plugin`。
