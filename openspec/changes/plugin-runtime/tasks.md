# Tasks

## 1. Core Plugin 契约

- [x] 1.1 在 `packages/nexum-core/src/plugin-registry.ts` 定义 Plugin Manifest、顶层注册摘要、状态、导出能力、Registry 和生命周期端口；先为 Manifest 必填字段、重复 ID、无效导出和状态转换编写 `packages/nexum-core/test/plugin-registry.test.ts` 的失败测试，并以 `cd packages/nexum-core && bun test test/plugin-registry.test.ts` 验证。
- [x] 1.2 在 `packages/nexum-core/src/plugin-invocation.ts` 定义显式 Plugin 激活、自然语言路由结果、激活错误和统一 `PluginActivationPort`；为显式优先、唯一自然语言候选、歧义不激活和内部能力不支持独立 `@` 编写 `packages/nexum-core/test/plugin-invocation.test.ts`，以同一 focused test 验证 RED/GREEN。

## 2. Application Registry 与 Loader

- [x] 2.1 在 `packages/nexum-application/src/plugin-registry.ts` 实现 Manifest 来源扫描、校验、摘要注册和懒加载；使用测试 Fixture 验证未激活 Plugin 不执行入口、激活失败不挂载能力，并运行 `cd packages/nexum-application && bun test test/plugin-registry.test.ts`。
- [x] 2.2 将 Plugin Registry 注入 `packages/nexum-application/src/index.ts` 的 Runtime 组合器，增加 Plugin 的 active scope、mount/unmount 和稳定诊断；扩展 Application runtime 测试，运行 `cd packages/nexum-application && bun test test/plugin-registry.test.ts test/runtime.test.ts`。

## 3. 显式与自然语言路由

- [x] 3.1 将 `@<plugin-id>` 接入 `packages/nexum-core/src/skill-invocation.ts` 旁的独立解析路径，确保独立 Skill 仍由原有解析器处理、Plugin 内部路径被拒绝；用 `packages/nexum-core/test/plugin-invocation.test.ts` 验证 mention 顺序、重复激活和稳定错误码。
- [x] 3.2 在 Application/Loop 中加入模型可见的 Plugin 路由摘要与内部激活控制能力，使无 `@` 的自然语言请求能够唯一匹配并激活 Plugin，且歧义时不激活；在 `packages/nexum-core/test/run-lifecycle.test.ts` 和 Application focused test 中验证两条路径最终共用同一激活端口。

## 4. Session、Prompt 与 Tool 作用域

- [ ] 4.1 在 `packages/nexum-core/src/runtime.ts`、`packages/nexum-core/src/tools.ts` 和 `packages/nexum-application/src/configured-loop.ts` 接入 Plugin active scope，使激活后的内部 Skill、Function、Workflow 和 Hook 只对当前 Session 可见；以 `packages/nexum-core/test/tools.test.ts` 和 `packages/nexum-core/test/session.test.ts` 验证未激活能力不可见、激活后可调用。
- [ ] 4.2 复用现有 Permission、Event、取消和错误边界，验证拒绝激活不执行 Plugin 代码，停用撤销注册并终结自有任务；运行 `cd packages/nexum-core && bun test test/plugin-invocation.test.ts test/tools.test.ts test/run-lifecycle.test.ts`。

## 5. Protocol、Server 与 Client 控制面

- [ ] 5.1 在 `packages/nexum-protocol/src/index.ts` 增加 Plugin 列表、详情、激活、停用和生命周期事件的稳定类型，并在 `packages/nexum-protocol/test/protocol.test.ts` 验证字段、错误码和能力声明。
- [ ] 5.2 在 `packages/nexum-server/src/index.ts` 增加 Plugin 控制接口和事件映射，新增 `packages/nexum-server/test/plugin-api.test.ts` 覆盖成功、未找到、未就绪、权限拒绝、激活失败和停用；若公开 HttpApi 变更，执行仓库规定的客户端生成流程并验证 `packages/nexum-client/src/index.ts` 与协议一致。

## 6. 文档、示例与集成验证

- [ ] 6.1 增加一个最小 CRM Plugin Fixture 和 Plugin 使用文档，明确 `@plugin`、自然语言激活、内部 Skill 不支持 `@`、权限和生命周期规则；验证示例可以被 Registry 发现并按测试路径激活。
- [ ] 6.2 在任务分支执行 `openspec validate plugin-runtime --strict`、各受影响 package 的 focused tests、`bun run check`，完成计划-实现一致性审计和全量 diff review；只有所有结果通过后标记本变更的 OpenSpec 任务完成。

## Workflow follow-up

- 在每个任务完成后执行 RED、GREEN、broader verification、代码审查、per-task audit，并单独提交一个带 OpenSpec task footer 的中文 Conventional Commit。
- 所有任务完成后执行最终审计，归档 `plugin-runtime` OpenSpec change，合并任务分支到 `dev-v0.0.1-feature-plugin`，并验证集成分支包含全部提交。
