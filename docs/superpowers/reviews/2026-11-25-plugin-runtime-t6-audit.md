# Plugin Runtime T6 审计

## 审计范围

本次审计覆盖 Core Plugin 路由、Coding Loop 接入、Application Runtime 组合及对应测试，完成 OpenSpec 任务 `3.2`。

## 结果

- 路由边界：通过。自然语言只使用已注册 Plugin 的 `intents`、`examples` 和 `keywords` 安全摘要；唯一候选才返回 automatic，多个候选返回 ambiguous，无候选返回 none。
- 触发优先级：通过。已注册的显式 `@plugin` 先于自然语言候选处理；显式路径和自动路径最终都调用同一个 `PluginActivationPort`。
- Skill 边界：通过。Plugin invocation 不消费未注册的 `@mention`，独立 Skill 仍由原有 Skill invocation 处理。
- Loop 接入：通过。非 continuation Prompt 在首次模型调用前执行 Plugin invocation；未激活 Plugin 的内部能力和完整入口没有加入模型工具定义。
- 歧义安全：通过。歧义或无匹配只返回空激活结果，不执行 mount，不改变 Session active scope。
- `code-review-spec`：通过。新增函数有多行中文 JSDoc、作者和日期；未使用 `any`、未使用导入或变量；路由逻辑保持在小函数内，未知值只在入口校验。
- REST API 文档：不适用。本任务没有新增或修改 Controller/API 路由。
- 项目依赖边界：通过。路由契约位于 Core，Application 只负责把 Registry、Runtime 和 Loop 组合起来。

## 验证证据

```text
cd packages/nexum-core && bun test test/plugin-invocation.test.ts test/coding-loop.test.ts
33 pass, 0 fail

cd packages/nexum-core && bun test
169 pass, 0 fail

cd packages/nexum-core && bun run typecheck
exit 0

cd packages/nexum-core && bunx oxlint src test
exit 0

cd packages/nexum-application && bun test test/plugin-runtime.test.ts
4 pass, 0 fail

bun run check
14 packages successful

openspec validate plugin-runtime --strict
Change 'plugin-runtime' is valid

git diff --check
exit 0
```

## 审计结论

通过。可以标记 OpenSpec 任务 `3.2` 完成并进入提交门禁；Session active scope 与工具权限复用任务 `4.1` 尚未开始。
