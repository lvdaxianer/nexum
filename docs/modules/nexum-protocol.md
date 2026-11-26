# `@nexum/protocol`

状态：现状基线

权威来源：[`packages/nexum-protocol/src/index.ts`](../../packages/nexum-protocol/src/index.ts)、[`packages/nexum-protocol/README.md`](../../packages/nexum-protocol/README.md)

最后核对：2026-11-24

## 职责

`@nexum/protocol` 是 Nexum 的跨进程、跨语言协议模型包。它只定义稳定的数据结构、协议常量和事件类型，不负责 HTTP 传输、Session 编排、权限执行或 UI 状态管理。

协议身份为 `nexum.runtime.v1`，HTTP 默认前缀为 `/api/nexum`。所有 JSON 响应使用 `data` 与 `meta.protocolVersion` 包装；事件流使用统一的 SSE 事件信封。

## 公开入口

包入口为 [`src/index.ts`](../../packages/nexum-protocol/src/index.ts)，主要导出：

- 协议常量：`NEXUM_PROTOCOL_VERSION`、`NEXUM_API_PREFIX`、`NEXUM_EXPERIMENTAL_API_PREFIX`。
- 事件目录：`NEXUM_EVENT_TYPES` 以及 `NexumEvent` 和各事件数据类型。
- JSON/错误模型：`JsonObject`、`NexumEnvelope`、`NexumErrorPayload`。
- 能力与模型：`NexumCapabilities`、`NexumCapability`、`NexumModelConfig`、`NexumRolePrompt`。
- Session 与交互：`NexumSession`、`NexumSessionMessages`、`NexumSessionState`、`NexumPermission`、`NexumQuestion`、`NexumSkill`。
- 权限策略：`NexumPermissionPolicyEffect`、`NexumPermissionPolicyScope`、`NexumPermissionPolicyRule`、`NexumPermissionPolicyList`、`NexumPermissionPolicyRuleInput`、`NexumPermissionPolicyRuleUpdate`、`NexumPermissionPolicyDeleteResult`。

协议字段是公共契约。新增或修改字段时，应同时更新 Server、Client、ChatSurface、API 文档和对应测试。

## 协议使用方式

Server 将模型编码为 JSON Envelope 或 SSE 事件；Client 校验 `meta.protocolVersion` 并把结果恢复为协议类型；UI 只消费协议数据和事件，不直接依赖 Server 内部实现。

```ts
import type { NexumEvent, NexumSession } from "nexum/protocol"

function renderSession(session: NexumSession) {
  return `${session.id}: ${session.status}`
}

function handleEvent(event: NexumEvent) {
  if (event.sessionID) console.log(event.type, event.sessionID)
}
```

完整的 Envelope、SSE、事件顺序和恢复语义见 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)、[`docs/capabilities/events.md`](../capabilities/events.md) 和 [`apis/nexum.md`](../../apis/nexum.md)。

## 依赖边界

该包无运行时依赖。依赖方向保持为 Schema/Protocol 位于边界，不能反向依赖 Core、Application、Server 或 UI。模块边界总览见 [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md)。

## 能力映射

| 协议模型                                                    | 使用能力                       | 消费模块                         |
| ----------------------------------------------------------- | ------------------------------ | -------------------------------- |
| `NexumSession`、`NexumSessionMessages`、`NexumSessionState` | Session 生命周期、历史和恢复   | Server、Client、ChatSurface      |
| `NexumEvent`                                                | SSE 事件、流式文本、工具和终态 | Server、ChatSurface、Surfaces    |
| `NexumPermission`、`NexumQuestion`                          | 人机交互请求与回复             | Application、Server、ChatSurface |
| `NexumPermissionPolicyRule`、`NexumPermissionPolicyList`    | 权限策略规则查询与管理         | Server、Client、CLI              |
| `NexumCapabilities`                                         | 能力发现和 UI 功能开关         | Server、Client、Surfaces         |
| `NexumSkill`、`NexumModelConfig`、`NexumRolePrompt`         | Skill、模型和角色提示配置      | Server、Client、Surfaces         |

## 测试与验证

在仓库根目录执行：

```sh
cd packages/nexum-protocol
bun test
bun run typecheck
```

协议测试位于 [`packages/nexum-protocol/test/protocol.test.ts`](../../packages/nexum-protocol/test/protocol.test.ts)，覆盖协议身份、完整事件类型集合、事件数据类型和 Session 消息分页。

## 修改同步清单

- 修改协议版本、Envelope 或事件字段：同步 [`apis/nexum.md`](../../apis/nexum.md) 与 [`docs/capabilities/events.md`](../capabilities/events.md)。
- 修改 Permission/Question/Skill 字段：同步 [`docs/ui/permission.md`](../ui/permission.md)、[`docs/ui/question.md`](../ui/question.md) 和对应 API 章节。
- 修改公共导出：检查 [`@nexum/client`](./nexum-client.md)、[`@nexum/chat-surface`](./nexum-chat-surface.md) 和协议测试。
