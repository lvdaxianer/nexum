# Plugin Runtime T7 审计

## 审计范围

本次审计覆盖 Plugin Runtime 的挂载工具契约、动态 Tool Registry、Coding Loop 工具定义刷新以及 Application/Core 测试，对应 OpenSpec 任务 `4.1`。

## 结果

- Session 作用域：通过。Plugin Function 工具只绑定到完成 mount 的 Session；同一 Plugin 在其他 Session 不可见，deactivate 后定义和执行绑定同时撤销。
- 模型工具集：通过。Coding Loop 在 Plugin invocation 后按 Session 获取动态工具定义；未激活 Plugin 的内部 Function 不进入模型 Prompt，激活后使用 `plugin__<plugin>__<function>` 稳定命名空间。
- 执行边界：通过。Plugin 工具仍经现有 `ToolPort` 执行路径，因此继续复用 Permission、取消信号和工具错误边界；Runtime 不直接绕过宿主 ToolPort。
- 入口校验：通过。挂载能力、工具定义、工具执行函数和卸载函数在 Application 边界统一校验；不完整挂载不会写入 active scope。
- 其他内部能力：通过。Plugin mount 保留统一 capabilities 与生命周期边界，Skill、Workflow、Hook 的专用执行语义继续由后续扩展在该 active scope 内接入，不提供独立 `@plugin/internal` 入口。
- `code-review-spec`：通过。新增生产文件均未超过 350 行；新增函数有多行中文 JSDoc、作者和日期；未使用 `any`、未使用导入或变量；动态未知值只在挂载边界校验。
- REST API 文档：不适用。本任务没有新增或修改 Controller/API 路由。
- 项目依赖边界：通过。动态工具组合位于 Application，Core 只新增动态工具定义回调，不依赖 Application。

## 验证证据

```text
cd packages/nexum-application && bun test test/plugin-runtime.test.ts
6 pass, 0 fail

cd packages/nexum-application && bun test
25 pass, 0 fail

cd packages/nexum-core && bun test
169 pass, 0 fail

cd packages/nexum-core && bun run typecheck
exit 0

cd packages/nexum-application && bun run typecheck
exit 0

bun run check
14 packages successful

openspec validate plugin-runtime --strict
Change 'plugin-runtime' is valid

git diff --check
exit 0
```

## 审计结论

通过。可以标记 OpenSpec 任务 `4.1` 完成并进入提交门禁；Permission、Event、取消和停用任务 `4.2` 尚未开始。
