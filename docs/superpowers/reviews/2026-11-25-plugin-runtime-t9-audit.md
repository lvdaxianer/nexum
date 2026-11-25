# Plugin Runtime T9 审计：Protocol、Server 与 Client 控制面

日期：2026-11-25  
分支：`features/✅CHG-001-T9--插件协议控制面`  
OpenSpec：`plugin-runtime` 任务 5.1、5.2

## 变更范围

- Protocol 增加 Plugin 安全摘要、详情、激活/停用结果、控制错误码和生命周期事件类型。
- Server 增加 `/api/nexum/plugins` 列表与详情接口，以及按 Session 激活、停用接口。
- Server 将激活、失败、停用写入当前 Session EventHub，并把 Core/Application 错误映射为稳定 HTTP 错误码。
- Client 增加与控制面一致的 Plugin list/detail/activate/deactivate 调用。
- Application Runtime 增加按 Plugin 查询 active Session 的只读端口，详情接口不暴露宿主路径或入口实现。

## 约束核对

- Plugin 详情只返回 Manifest 安全字段、诊断和 active Session ID，不返回入口路径、密钥或动态模块内容。
- Server 激活前校验 Session；权限拒绝发生在入口动态加载和 mount 之前。
- 挂载失败不会进入 active scope；停用先撤销能力，再执行 Plugin unmount。
- Plugin 生命周期事件沿用现有 Session EventHub 和递增 sequence，不新建旁路事件总线。
- 新增接口使用稳定错误码：`NEXUM_PLUGIN_NOT_FOUND`、`NEXUM_PLUGIN_NOT_READY`、`NEXUM_PLUGIN_PERMISSION_DENIED`、`NEXUM_PLUGIN_MOUNT_FAILED`、`NEXUM_PLUGIN_DEACTIVATION_FAILED`。
- 仓库不存在 `packages/client` 或 `bun run generate` 入口；对应的 `packages/nexum-client` 是源码型协议 Client，已直接同步新增类型和调用方法并通过其测试。

## 验证证据

- `cd packages/nexum-protocol && bun test test/protocol.test.ts`：7 pass。
- `cd packages/nexum-protocol && bun run typecheck`：通过。
- `cd packages/nexum-application && bun run typecheck`：通过。
- `cd packages/nexum-application && bun test test/plugin-registry.test.ts test/plugin-runtime.test.ts`：10 pass。
- `cd packages/nexum-server && bun run typecheck`：通过。
- `cd packages/nexum-server && bun test`：79 pass。
- `cd packages/nexum-client && bun run typecheck && bun test`：9 pass。
- `bunx oxlint packages/nexum-server/src/index.ts packages/nexum-server/test/plugin-api.test.ts packages/nexum-protocol/src/index.ts packages/nexum-protocol/test/protocol.test.ts packages/nexum-application/src/plugin-runtime.ts packages/nexum-client/src/index.ts`：通过。
- `git diff --check`：通过。

## 结论

T9 的 Protocol、Server 和 Client 控制面与现有 Session、Permission、Tool、Event 边界一致；5.1、5.2 可标记完成。CRM Fixture、使用文档和最终集成验证留给 T10/T11。
