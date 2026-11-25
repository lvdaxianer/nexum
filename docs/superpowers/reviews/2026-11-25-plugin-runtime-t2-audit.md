# Plugin Runtime T2 审计

## 审计范围

本次审计覆盖 `packages/nexum-core/src/plugin-invocation.ts`、`packages/nexum-core/src/index.ts`、`packages/nexum-core/test/plugin-invocation.test.ts` 以及 OpenSpec 任务 `1.2`。

## 结果

- 任务边界：通过。只实现显式 Plugin mention 解析、内部能力路径拒绝、自然语言路由结果类型、稳定错误码和统一激活端口，不包含 Application Loader、模型路由执行或 Server API。
- OpenSpec 一致性：通过。显式和自然路由结果可以汇聚到同一个 `NexumPluginActivationPort`；内部 Plugin 能力没有独立 `@` 入口；激活结果区分显式与自动来源。
- TDD：通过。先运行 focused test 得到缺少导出错误；随后实现最小 Core 契约并补充 mention 原始位置、未注册 Plugin 和内部路径测试，focused test 全部通过。
- 权限与运行时边界：本任务没有执行 Plugin 代码、加载实现或产生业务副作用；权限、Loader、Session scope 和模型控制能力留在后续任务。
- `code-review-spec`：通过。新增导出函数和错误构造函数有多行中文 JSDoc、作者和日期；未使用 `any`、未使用导入或变量；新增文件规模在限制内；显式 mention 解析只消费安全摘要；错误码可供 API/UI 稳定映射。
- REST API 文档：不适用。本任务没有新增或修改 Controller/API 路由。
- 项目依赖边界：通过。契约新增在 Core，仅依赖 Core 内部 Plugin Registry 类型，未引入 Application、Server 或基础设施依赖。

## 验证证据

```text
cd packages/nexum-core && bun test test/plugin-invocation.test.ts
6 pass, 0 fail

cd packages/nexum-core && bun test
163 pass, 0 fail

cd packages/nexum-core && bun run typecheck
exit 0

cd packages/nexum-core && bunx oxlint src test
exit 0

bun run check
14 packages successful

openspec validate plugin-runtime --strict
Change 'plugin-runtime' is valid

git diff --check
exit 0
```

## 审计结论

通过。可以标记 OpenSpec 任务 `1.2` 完成并进入提交门禁；Application Registry 与 Loader 任务 `2.1` 尚未开始。
