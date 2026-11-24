# Tasks

## 1. 文档入口与架构基线

- [x] 1.1 创建并验证文档体系的设计资产：完成 `proposal.md`、`design.md`、`tasks.md`、`skip_specs: true` 配置和 `openspec status --change nexum-documentation-system` 校验。
- [x] 1.2 更新根 `README.md` 的“文档导航”，并让 `docs/README.md`、`apis/README.md`、`packages/README.md` 回链根 README；验证所有导航目标文件存在且 Markdown Prettier 通过。
- [x] 1.3 创建 `docs/architecture/module-boundaries.md` 和 `docs/architecture/runtime-flow.md`；根据当前 package README、依赖配置和 Server/Application 入口核对边界，并验证文档引用的源码路径存在。

## 2. UI 与能力协议

- [x] 2.1 创建 `docs/ui/interaction-protocol.md` 和 `docs/ui/states.md`，定义 Runtime 驱动交互与 UI 本地交互、加载/空态/错误/提交中/取消/恢复状态；验证每个状态都能对应当前 Surface 实现或 Protocol 事件。
- [x] 2.2 创建 `docs/ui/question.md` 和 `docs/ui/permission.md`，完整记录 Question/Permission 的触发、发现、展示、回复、取消、重启和错误行为；验证字段、端点和事件与 Protocol、Application、Server 源码一致。
- [x] 2.3 创建 `docs/capabilities/session.md` 和 `docs/capabilities/events.md`，记录 Session 生命周期、消息历史、SSE 序列、去重、终态和恢复；验证示例中的事件类型和字段来自 `packages/nexum-protocol/src/index.ts`。
- [x] 2.4 创建 `docs/capabilities/skills.md`、`docs/capabilities/integrations.md`、`docs/capabilities/model-runtime.md` 和 `docs/capabilities/context-and-history.md`；验证每篇文档至少链接一个实现模块、一个测试或现有规范，并通过格式检查。

## 3. Runtime API 文档

- [ ] 3.1 建立 `apis/nexum.md` 的完整路由覆盖表，核对 `packages/nexum-server/src/index.ts` 的 health、capabilities、model/config、role-prompt 和 session 路由；验证每个已暴露路由都有唯一文档章节锚点。
- [ ] 3.2 补齐 Session、messages、prompt、continue、cancel 和 events 端点章节，记录请求参数、Header、Cookie、成功/错误响应、SSE 语义、重试/取消/恢复和 curl 示例；验证示例路径与 Server 路由一致。
- [ ] 3.3 补齐 permission、question、policy 和 skills 端点章节，记录交互状态、冲突、幂等、错误码和调用方处理；验证字段与 Protocol/Application/Server 测试一致。
- [ ] 3.4 对 `apis/nexum.md` 执行 API 文档完整性审计：Controller/route 覆盖、请求/响应字段、状态码、Header/Cookie、示例和未知信息标记；验证 `git diff --check`、Prettier 和路由覆盖脚本/命令均通过。

## 4. Package 模块文档

- [ ] 4.1 创建 `docs/modules/nexum-protocol.md`、`nexum-client.md`、`nexum-server.md`、`nexum-chat-surface.md` 和 `nexum-surfaces.md`；核对公开入口、依赖方向、能力映射、接入示例和测试命令，并验证源码链接存在。
- [ ] 4.2 创建 `docs/modules/nexum-core.md`、`nexum-application.md`、`nexum-persistence.md`、`nexum-integrations.md` 和 `nexum-test.md`；核对职责边界、端口/适配器、持久化/恢复行为、运行时组合和测试入口，并验证 package 级命令可从文档定位。
- [ ] 4.3 为每份模块文档补充“修改同步清单”，将其关联到对应能力文档、API 文档、源码入口和测试；验证 `packages/` 下每个 `nexum-*` 目录都有且只有一个模块文档入口。

## 5. 集成验证与交付

- [ ] 5.1 统一所有文档的相对链接、状态标签、权威来源和最后核对日期；验证根 README 可以导航到所有交付文档，且不存在失效本地链接。
- [ ] 5.2 执行全量文档交付检查：`openspec validate --change nexum-documentation-system`、`git diff --check`、`bunx prettier --check "README.md" "docs/**/*.md" "apis/**/*.md" "packages/README.md"`，并完成路由/模块清单逐项审计。

## Workflow follow-up

- 所有任务通过逐任务审查、验证和提交后，合并到 `dev-v0.0.1`，确认任务分支祖先关系，再按工作流归档 OpenSpec change。
