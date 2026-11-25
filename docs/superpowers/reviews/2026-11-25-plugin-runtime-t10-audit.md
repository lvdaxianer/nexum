# Plugin Runtime T10 审计：CRM Fixture 与使用文档

日期：2026-11-25
分支：`features/✅CHG-001-T10--CRM插件示例`
OpenSpec：`plugin-runtime` 任务 6.1

## 变更范围

- 增加可由本地 Plugin Source 扫描的 `crm` Fixture，Manifest 同时声明 Skill、Function、Workflow 和 Hook。
- 增加可挂载的 `order.query` Function，验证激活后生成 `plugin__crm__order_query` Session 工具，停用后工具消失。
- 增加 `docs/capabilities/plugins.md`，说明 `@crm`、自然语言路由、内部能力 mention 边界、Permission 和生命周期。
- 更新 `apis/nexum.md` 和 `docs/README.md`，同步 Plugin HTTP 控制面、错误码与事件文档。

## 约束核对

- Fixture 使用真实 `plugin.json` + `entry`，测试通过公开 `createNexumPluginRegistry({ roots })` 和 `createNexumPluginRuntime` 发现、激活、工具调用、停用。
- `@crm` 只激活 Plugin，不自动执行订单查询；内部 `@crm/order.query` 不作为用户级入口。
- Function 工具保留 `plugin__crm__` 命名空间并绑定当前 Session；停用后不再出现在 Tool Registry。
- 文档明确自然语言只有唯一路由候选才自动激活，歧义时不激活；Permission 拒绝不执行入口代码。

## 验证证据

- `cd packages/nexum-application && bun test test/crm-plugin.test.ts test/plugin-registry.test.ts test/plugin-runtime.test.ts`：11 pass。
- `cd packages/nexum-application && bun run typecheck`：通过。
- `bunx prettier --check 'docs/capabilities/plugins.md' 'docs/README.md' 'apis/nexum.md'`：通过（`apis/nexum.md` 已格式化）。
- `git diff --check`：通过。

## 结论

CRM Fixture 能够沿公开 Registry/Runtime 路径被发现和激活，文档覆盖 T10 要求的触发、命中、内部能力、权限和生命周期规则；6.1 可标记完成。最终集成验证和 OpenSpec 归档留给 T11。
