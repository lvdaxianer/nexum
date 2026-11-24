# 模块文档索引

状态：现状基线

权威来源：[`packages/`](../../packages/)、[`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md)

最后核对：2026-11-24

本目录为每个 `packages/nexum-*` 包提供唯一模块文档入口。模块文档描述职责、公开入口、依赖边界、能力/API 映射、测试入口和修改同步清单；公共 HTTP/SSE 字段仍以 [`apis/nexum.md`](../../apis/nexum.md) 为准，交互状态以 [`docs/ui/`](../ui/) 为准。

## 一对一清单

| Package 目录         | 模块文档                                           | 源码入口                                                         | 测试/验证入口                                                                                    | 能力或 API 关联                                                                                        |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `nexum-protocol`     | [`nexum-protocol.md`](./nexum-protocol.md)         | [`src/index.ts`](../../packages/nexum-protocol/src/index.ts)     | [`test/protocol.test.ts`](../../packages/nexum-protocol/test/protocol.test.ts)                   | [`apis/nexum.md`](../../apis/nexum.md)、[`events.md`](../capabilities/events.md)                       |
| `nexum-client`       | [`nexum-client.md`](./nexum-client.md)             | [`src/index.ts`](../../packages/nexum-client/src/index.ts)       | [`test/client.test.ts`](../../packages/nexum-client/test/client.test.ts)                         | [`apis/nexum.md`](../../apis/nexum.md)、[`events.md`](../capabilities/events.md)                       |
| `nexum-server`       | [`nexum-server.md`](./nexum-server.md)             | [`src/index.ts`](../../packages/nexum-server/src/index.ts)       | [`test/server.test.ts`](../../packages/nexum-server/test/server.test.ts)                         | [`apis/nexum.md`](../../apis/nexum.md)、[`session.md`](../capabilities/session.md)                     |
| `nexum-core`         | [`nexum-core.md`](./nexum-core.md)                 | [`src/index.ts`](../../packages/nexum-core/src/index.ts)         | [`test/coding-loop.test.ts`](../../packages/nexum-core/test/coding-loop.test.ts)                 | [`permission.md`](../ui/permission.md)、[`model-runtime.md`](../capabilities/model-runtime.md)         |
| `nexum-application`  | [`nexum-application.md`](./nexum-application.md)   | [`src/index.ts`](../../packages/nexum-application/src/index.ts)  | [`test/runtime.test.ts`](../../packages/nexum-application/test/runtime.test.ts)                  | [`module-boundaries.md`](../architecture/module-boundaries.md)、[`apis/nexum.md`](../../apis/nexum.md) |
| `nexum-persistence`  | [`nexum-persistence.md`](./nexum-persistence.md)   | [`src/index.ts`](../../packages/nexum-persistence/src/index.ts)  | [`test/session-store.test.ts`](../../packages/nexum-persistence/test/session-store.test.ts)      | [`session.md`](../capabilities/session.md)、[`events.md`](../capabilities/events.md)                   |
| `nexum-integrations` | [`nexum-integrations.md`](./nexum-integrations.md) | [`src/index.ts`](../../packages/nexum-integrations/src/index.ts) | [`runtime.test.ts`](../../packages/nexum-application/test/runtime.test.ts)                       | [`model-runtime.md`](../capabilities/model-runtime.md)、[`apis/nexum.md`](../../apis/nexum.md)         |
| `nexum-chat-surface` | [`nexum-chat-surface.md`](./nexum-chat-surface.md) | [`src/index.ts`](../../packages/nexum-chat-surface/src/index.ts) | [`test/chat-projection.test.ts`](../../packages/nexum-chat-surface/test/chat-projection.test.ts) | [`interaction-protocol.md`](../ui/interaction-protocol.md)、[`apis/nexum.md`](../../apis/nexum.md)     |
| `nexum-surfaces`     | [`nexum-surfaces.md`](./nexum-surfaces.md)         | [`src/main.tsx`](../../packages/nexum-surfaces/src/main.tsx)     | [`test/permission.smoke.spec.ts`](../../packages/nexum-surfaces/test/permission.smoke.spec.ts)   | [`states.md`](../ui/states.md)、[`events.md`](../capabilities/events.md)                               |
| `nexum-test`         | [`nexum-test.md`](./nexum-test.md)                 | [`src/dev.ts`](../../packages/nexum-test/src/dev.ts)             | [`test/persistent-poc.test.ts`](../../packages/nexum-test/test/persistent-poc.test.ts)           | [`session.md`](../capabilities/session.md)、[`apis/nexum.md`](../../apis/nexum.md)                     |

## 审计规则

- `packages/` 下每个一级 `nexum-*` 目录必须在上表出现一次。
- 每个模块文档文件名必须与 package 名称对应，且只能由上表作为模块入口。
- 每个模块文档必须保留“修改同步清单”，至少指向源码入口、测试入口以及受影响的能力/API 文档。
- 新增或重命名 package 时，先更新本索引，再更新根 [`README.md`](../../README.md) 和 [`packages/README.md`](../../packages/README.md)。
