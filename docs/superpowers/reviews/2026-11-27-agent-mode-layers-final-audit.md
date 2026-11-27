# Agent 模式三层实现最终审计

日期：2026-11-27

## 审计范围

- `proposal.md`、`design.md`、`specs/agent-mode-selection/spec.md`
- `specs/headless-session-control/spec.md`
- `specs/chat-surface/spec.md`
- Core、Application、Protocol、Client、Server、Surface 及相关测试和文档

## 结论

实现与变更设计一致，Plan/Build 模式已贯通三层，并且页面可见、创建时可选择、实例化时可配置。

## 边界核对

| 层 | 核对结果 |
| --- | --- |
| Core | `createNexumSessionService({ defaultAgentMode })` 提供服务默认值；`session.create({ mode })` 显式值优先；未提供时默认为 `build`。运行中仍禁止切换。 |
| Application | `NexumRuntimeOptions.defaultAgentMode` 只在 Application 自动创建 Session Service 时传入 Core；Local/SQLite Runtime 继续透传；显式 Session 模式覆盖 Runtime 默认。 |
| Protocol/Client | 创建请求支持 `mode`；Server 在协议边界校验并返回规范化的必有 `mode`；Client 保持请求和响应类型一致。 |
| Surface | 新建 Session 表单可选 Plan/Build；Session 列表、当前标题和 Composer 同时显示模式；运行中控件禁用，创建/切换失败时保留已有状态。 |

## 兼容性与错误契约

- 旧持久化记录缺失或包含非法模式时仍规范化为 `build`。
- 非法创建模式在 Protocol 边界拒绝，不进入持久化层。
- Session 模式切换保持既有运行中保护和稳定错误结构。
- 新增 UI 状态沿用现有请求忙碌、错误和响应快照合并路径，没有复制 Core 的执行规则。

## 验证证据

- `openspec validate agent-mode-layers --type change --strict`：通过。
- `bun run check`：通过，14 个 typecheck 任务成功。
- Core：177 pass。
- Application：19 pass。
- Server：83 pass。
- Client：10 pass。
- Persistence：30 pass。
- Chat Surface：19 pass。
- CLI：175 pass。
- Surface Adapter：3 pass。
- Agent 模式专项 UI smoke：1 pass，覆盖创建时选择 Plan、请求体 `mode: "plan"`、列表 PLAN 标识和 Composer 当前模式标识。
- `git diff --check`：通过。

## 交付状态

- 未修改用户原有的文档工作区变更。
- 未直接修改生成 Client 文件；本仓库没有 `packages/client`，实际 Client 包为 `packages/nexum-client`，本任务没有公共 Server HttpApi 生成文件需要更新。
