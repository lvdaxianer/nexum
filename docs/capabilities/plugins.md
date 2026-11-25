# Plugin 能力

状态：现状基线  
最后核对：2026-11-25

Plugin 是与独立 Skill 平级的顶层扩展包。它可以在一个包里组合 Skill、Function、Workflow 和 Hook，但用户只通过顶层 `@<plugin-id>` 激活整个包；内部能力不注册为独立的 `@` 目标。

## 1. 最小 CRM Plugin

可运行 Fixture 位于 [`packages/nexum-application/test/fixtures/crm-plugin`](../../packages/nexum-application/test/fixtures/crm-plugin)。它声明了：

- `customer-support`：内部 Skill；
- `order.query`：查询订单的 Function，并挂载为 Session 工具 `plugin__crm__order_query`；
- `ticket-triage`：客服工单 Workflow 描述；
- `support.audit`：客服操作 Hook 描述。

Manifest 只包含路由和安全摘要所需的信息。入口模块只有在 Plugin 激活后才动态加载。

## 2. 两种命中方式

显式命中：

```text
@crm 查询订单 123
```

这会激活当前 Session 的 `crm`，不会自动查询订单、发送消息或修改业务数据。激活成功后，模型才会看到当前 Session 的 Plugin 工具。

自然语言命中：

```text
我的订单为什么还没有收到
```

Runtime 先使用 Manifest 的 `intents`、`examples` 和 `keywords` 做轻量路由。只有唯一候选才自动激活；多个候选时不激活，继续普通 Agent 流程或请求澄清。显式 `@crm` 优先于自然语言路由。

## 3. Mention 边界

以下形式都不是用户级 Plugin 入口：

```text
@crm/customer-support
@crm/order.query
```

它们不会绕过顶层 Plugin 激活路径。Plugin 内部能力由模型、Router 或已激活 Workflow 选择，并始终保留 `crm` 命名空间和当前 Session 边界。

## 4. 权限和生命周期

Plugin 激活先经过现有 `PermissionPort`，被拒绝时不会执行入口模块，也不会挂载能力。具体 Function 调用仍经过 Tool/Permission 边界。

每个 Session 独立维护 active scope：

```text
registered → activate → active → deactivate
                         └→ failed
```

停用先撤销当前 Session 的 Plugin 工具资格，再执行 Plugin 的 `unmount` 清理函数；失败会通过稳定错误码和 Session EventHub 暴露。生命周期事件包括 `plugin.activated`、`plugin.failed` 和 `plugin.deactivated`。

## 5. Server 控制面

```text
GET  /api/nexum/plugins
GET  /api/nexum/plugins/:id
POST /api/nexum/plugins/:id/activate    { "sessionID": "...", "source": "explicit" }
POST /api/nexum/plugins/:id/deactivate  { "sessionID": "..." }
```

列表和详情只返回安全 Manifest、诊断和 active Session ID，不返回宿主绝对路径、入口代码或凭据。调用方依赖稳定 `errorCode`，包括 `NEXUM_PLUGIN_NOT_FOUND`、`NEXUM_PLUGIN_NOT_READY`、`NEXUM_PLUGIN_PERMISSION_DENIED` 和 `NEXUM_PLUGIN_MOUNT_FAILED`。

## 6. 相关入口

- [Plugin Runtime OpenSpec](../../openspec/changes/plugin-runtime/)
- [Plugin Application Fixture](../../packages/nexum-application/test/crm-plugin.test.ts)
- [Plugin Server API 测试](../../packages/nexum-server/test/plugin-api.test.ts)
- [Nexum HTTP API](../../apis/nexum.md)
