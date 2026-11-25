# Plugin Runtime T8 审计

## 审计范围

本次审计覆盖 Plugin Runtime 激活权限、入口执行边界、active scope 回滚与卸载诊断，对应 OpenSpec 任务 `4.2`。

## 结果

- 激活权限：通过。Plugin Runtime 在动态入口加载和 mount 前调用现有 PermissionPort；`deny`/`ask` 都映射为稳定 `plugin_permission_denied`，不会执行入口、创建 active scope 或暴露工具。
- Tool 权限：通过。已挂载 Function 的实际执行继续经 Coding Loop 的 Permission 与 ToolPort；Plugin Runtime 不绕过宿主审批。
- 失败回滚：通过。入口加载、挂载校验或 mount 失败都不写入 active scope，并记录 `plugin_mount_failed` 诊断。
- 停用边界：通过。停用先撤销 Session 内注册，再执行 Plugin unmount；Runtime close 等待自有挂载清理，失败记录 `plugin_unmount_failed`。
- 取消边界：通过。激活审批使用现有 PermissionPort，因此由 Permission Broker 的 Session 取消机制唤醒；Plugin 入口只在审批完成后执行。
- 事件边界：生命周期事件字段和对外映射留在后续 Protocol/Server 控制面任务，当前任务不伪造持久事件序号。
- `code-review-spec`：通过。新增函数有多行中文 JSDoc、作者和日期；未使用 `any`、未使用导入或变量；动态入口和挂载结果只在 Application 边界校验。
- REST API 文档：不适用。本任务没有新增或修改 Controller/API 路由。
- 项目依赖边界：通过。Permission 复用 Core 端口，Plugin 生命周期保持 Application 作用域，未引入 Server/Protocol 反向依赖。

## 验证证据

```text
cd packages/nexum-application && bun test test/plugin-runtime.test.ts
7 pass, 0 fail

cd packages/nexum-application && bun test
26 pass, 0 fail

cd packages/nexum-application && bun run typecheck
exit 0

cd packages/nexum-application && bunx oxlint src test
exit 0

bun run check
14 packages successful

openspec validate plugin-runtime --strict
Change 'plugin-runtime' is valid

git diff --check
exit 0
```

## 审计结论

通过。可以标记 OpenSpec 任务 `4.2` 完成并进入提交门禁；Protocol、Server 和 Client 控制面任务 `5.1`、`5.2` 尚未开始。
