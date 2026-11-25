# Plugin Runtime T5 审计

## 审计范围

本次审计覆盖 `packages/nexum-core/src/plugin-invocation.ts`、`packages/nexum-core/src/index.ts`、Application Runtime 组合以及 `packages/nexum-core/test/plugin-invocation.test.ts`，对应 OpenSpec 任务 `3.1`。

## 结果

- 任务边界：通过。新增独立 Plugin 显式调用端口，与 Skill invocation 保持并列；没有把 Plugin 内部导出能力暴露成独立 `@` 入口，也没有实现自然语言模型路由。
- 命中语义：通过。只消费已注册的顶层 Plugin ID；同一输入中的重复 Plugin 按首次出现顺序去重；显式路径统一以 `source: "explicit"` 调用同一激活端口。
- Skill 边界：通过。未注册的 `@mention` 不被 Plugin 解析器消费，`@skill` 可继续交给现有独立 Skill 路径。
- 安全边界：通过。已注册 Plugin 的 `@plugin/internal-capability` 继续抛出稳定 `plugin_internal_mention` 错误；未知 Plugin 由原始单 mention 解析 API 保留稳定 `plugin_not_found` 语义。
- Runtime 组合：通过。Embedded Runtime 暴露 `pluginInvocation`，其激活端口绑定到按 Session 隔离的 Plugin Runtime。
- `code-review-spec`：通过。新增函数有多行中文 JSDoc、作者和日期；未使用 `any`、未使用导入或变量；新增文件规模在限制内；解析器只在安全摘要边界做命中判断。
- REST API 文档：不适用。本任务没有新增或修改 Controller/API 路由。
- 项目依赖边界：通过。调用契约位于 Core，Application 只负责组合 Core 端口和实际 Plugin Runtime。

## 验证证据

```text
cd packages/nexum-core && bun test test/plugin-invocation.test.ts
8 pass, 0 fail

cd packages/nexum-core && bun test
165 pass, 0 fail

cd packages/nexum-core && bun run typecheck
exit 0

cd packages/nexum-core && bunx oxlint src test
exit 0

cd packages/nexum-application && bun test test/plugin-runtime.test.ts
3 pass, 0 fail

bun run check
14 packages successful

openspec validate plugin-runtime --strict
Change 'plugin-runtime' is valid

git diff --check
exit 0
```

## 审计结论

通过。可以标记 OpenSpec 任务 `3.1` 完成并进入提交门禁；自然语言 Plugin 路由任务 `3.2` 尚未开始。
