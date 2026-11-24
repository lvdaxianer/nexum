# `@nexum/server`

状态：现状基线

权威来源：[`packages/nexum-server/src/index.ts`](../../packages/nexum-server/src/index.ts)、[`packages/nexum-server/src/main.ts`](../../packages/nexum-server/src/main.ts)、[`packages/nexum-server/README.md`](../../packages/nexum-server/README.md)

最后核对：2026-11-24

## 职责

`@nexum/server` 是 Nexum 的 HTTP/SSE 入口和运行时组装层。它负责路由、JSON Envelope、SSE 投递、Session 编排、模型与角色提示配置入口，以及将 Application/Core 能力暴露为公共 Protocol API。

Server 不拥有 Core 的工具和权限决策，也不把 UI 规则下沉到 HTTP 控制器。UI 交互约定见 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)，路由契约见 [`apis/nexum.md`](../../apis/nexum.md)。

## 公开入口与启动

入口 [`src/index.ts`](../../packages/nexum-server/src/index.ts) 导出 `startNexumServer(options)` 和 `NexumServer` 句柄。开发/参考启动入口为 [`src/main.ts`](../../packages/nexum-server/src/main.ts)。

```ts
import { startNexumServer } from "@nexum/server"

const server = await startNexumServer({
  hostname: "127.0.0.1",
  port: 4097,
})

await server.stop()
```

实际选项以 `src/index.ts` 的导出类型为准；公共 HTTP 行为以 API 文档为准，不应从示例推断未公开的部署配置。

## 路由与运行时能力

| 能力                   | Server 行为                                | 相关文档                                                                                   |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Health/Capabilities    | 返回协议身份、能力清单和可用事件           | [`apis/nexum.md`](../../apis/nexum.md)                                                     |
| Model/Role Prompt      | 读写运行时配置并提供探测入口               | [`docs/capabilities/model-runtime.md`](../capabilities/model-runtime.md)                   |
| Session                | 创建、列出、更新、删除和读取状态/历史      | [`docs/capabilities/session.md`](../capabilities/session.md)                               |
| Prompt/Continue/Cancel | 驱动一次运行、恢复或取消                   | [`docs/capabilities/session.md`](../capabilities/session.md)                               |
| Events                 | 将事件按序列以 SSE 投递                    | [`docs/capabilities/events.md`](../capabilities/events.md)                                 |
| Permission/Question    | 暴露待处理项和回复入口                     | [`docs/ui/permission.md`](../ui/permission.md)、[`docs/ui/question.md`](../ui/question.md) |
| Skill                  | 提供发现、详情、注册、刷新、校验和注销路由 | [`docs/capabilities/skills.md`](../capabilities/skills.md)                                 |

请求和响应必须符合 [`@nexum/protocol`](./nexum-protocol.md) 的 Envelope 和事件类型。插件或运行时能力尚未加载时，Server 返回当前已加载结果；Client 负责在需要时刷新或重试发现，不应让 Server 等待插件激活。

## 数据与安全边界

参考 `src/main.ts` 使用 JSON 文件保存 Session 和模型配置。默认数据位于 `.nexum/`，可用 `NEXUM_DATA_DIR`、`NEXUM_SESSION_FILE`、`NEXUM_MODEL_CONFIG_FILE` 覆盖路径。凭据文件使用 `0600` 权限，Server 不回显凭据。

持久化、恢复和运行时编排分别由 [`@nexum/persistence`](../../packages/nexum-persistence/README.md)、[`@nexum/application`](../../packages/nexum-application/README.md) 和 [`@nexum/core`](../../packages/nexum-core/README.md) 提供；Server 通过端口组装它们，不能把存储细节或策略判断复制到路由层。

## 依赖边界

Server 依赖 Application、Core 和 Protocol，负责向外提供 HTTP/SSE。Client 只能依赖 Protocol；UI 通过 Client 或稳定的 ChatProtocolAdapter 访问 Server。完整依赖方向见 [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md)。

## 测试与验证

```sh
cd packages/nexum-server
bun test
bun run typecheck
```

Server 测试从 [`packages/nexum-server/test/server.test.ts`](../../packages/nexum-server/test/server.test.ts) 及同目录测试文件进入，覆盖路由、协议、事件和 Skill 行为。修改公共路由后，还应按仓库约定更新 API 文档并执行 Client/Server 联合验证。

## 修改同步清单

- 修改路由或 HTTP 方法：同步 [`apis/nexum.md`](../../apis/nexum.md)、[`@nexum/client`](./nexum-client.md) 和路由测试。
- 修改事件投递/恢复：同步 [`docs/capabilities/events.md`](../capabilities/events.md)、[`docs/ui/states.md`](../ui/states.md) 和 SSE 测试。
- 修改 Permission/Question/Skill：同步对应 UI/能力文档、Protocol 模型和 Application 测试。
- 修改公开 Protocol 或 Server HttpApi：在 `packages/client` 执行 `bun run generate`，并检查生成客户端差异。
