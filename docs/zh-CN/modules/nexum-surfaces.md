# `@nexum/surfaces`

[English](../../modules/nexum-surfaces.md)

状态：公共可嵌入组件

权威来源：[`packages/nexum-surfaces/README.md`](../../../packages/nexum-surfaces/README.md)、[`packages/nexum-surfaces/src/main.tsx`](../../../packages/nexum-surfaces/src/main.tsx)

最后核对：2026-11-28

## 职责

`nexum-ai/surfaces` 是 Nexum 的完整 Web 工作台组件，可以通过 `import` 直接嵌入宿主前端。它把 Model、Session、Coding Loop、函数调用、Permission、Question、Context Compaction、Skill 和事件时间线组合成可运行的工作台。

```tsx
import { render } from "solid-js/web"
import { NexumSurfaces } from "nexum-ai/surfaces"
import "nexum-ai/surfaces/styles.css"

render(() => <NexumSurfaces apiBaseUrl="http://127.0.0.1:4097" />, document.getElementById("root")!)
```

`apiBaseUrl` 可选；未提供时使用 `VITE_NEXUM_API_URL`，或当前页面主机的 `4097` 端口。

Surface 只负责展示、用户操作和 SSE 投影，不拥有 Core 工具、权限策略或 Session 规则。它保留原始协议字段和事件名，便于调试协议行为。

## 入口与布局

公共组件入口为 [`src/index.ts`](../../../packages/nexum-surfaces/src/index.ts)，本地 Vite 启动入口为 [`src/entry.tsx`](../../../packages/nexum-surfaces/src/entry.tsx)，工作台实现为 [`src/main.tsx`](../../../packages/nexum-surfaces/src/main.tsx)，样式在 [`src/styles.css`](../../../packages/nexum-surfaces/src/styles.css)。当前布局为左侧导航、中央 Chat、右侧状态区，并通过 Kobalte 提供抽屉交互。

组件消费 [`nexum-ai/chat-surface`](./nexum-chat-surface.md) 和 [`nexum-ai/client`](./nexum-client.md)，通过事件时间线显示原始事件和已投影的 Chat 状态。事件以 `eventID` 去重，工具/请求卡片按对应 ID 聚合。

## 本地预览

先启动参考 Server，再启动 Vite Surface：

```sh
bun packages/nexum-server/src/main.ts
bun run --cwd packages/nexum-surfaces dev -- --host 127.0.0.1 --port 5173
```

访问 `http://127.0.0.1:5173`。页面中的协议字段、状态和交互规则以 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)、[`docs/ui/states.md`](../ui/states.md) 和 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md) 为准。

## 能力映射

| Surface 区域        | 消费能力                           | 规范                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat                | Session 历史、流式消息、取消和继续 | [`docs/capabilities/session.md`](../capabilities/session.md)                                                                                                                                                               |
| Permission/Question | 待处理项、回复和取消               | [`docs/ui/permission.md`](../ui/permission.md)、[`docs/ui/question.md`](../ui/question.md)                                                                                                                                 |
| Event Timeline      | SSE 序列、事件去重、终态           | [`docs/capabilities/events.md`](../capabilities/events.md)                                                                                                                                                                 |
| Model/Context/Skill | 模型配置、上下文、Skill 发现       | [`docs/capabilities/model-runtime.md`](../capabilities/model-runtime.md)、[`docs/capabilities/context-and-history.md`](../capabilities/context-and-history.md)、[`docs/capabilities/skills.md`](../capabilities/skills.md) |

## 依赖边界

Surface 是应用组合层，可依赖 Application、ChatSurface、Client、Integrations、Persistence 以及 UI 运行时库。它不能反向定义 Protocol、Core 或 Server 的业务契约；宿主只需安装统一 `nexum-ai` 包，不需要安装 `@nexum/*` workspace 包。

## 测试与验证

```sh
bun run --cwd packages/nexum-surfaces typecheck:tsc
bun run --cwd packages/nexum-surfaces build
bun run --cwd packages/nexum-surfaces test:smoke
```

权限交互的冒烟场景位于 [`packages/nexum-surfaces/test/permission.smoke.spec.ts`](../../../packages/nexum-surfaces/test/permission.smoke.spec.ts)。需要隔离环境时使用 `test:smoke:isolated`。

## 修改同步清单

- 修改 Surface 的交互状态或展示文案：同步 [`docs/ui/states.md`](../ui/states.md) 和 [`docs/ui/interaction-protocol.md`](../ui/interaction-protocol.md)。
- 修改事件投影/时间线：同步 [`docs/capabilities/events.md`](../capabilities/events.md) 和 ChatSurface 文档。
- 修改 Server 或 Client 能力：同步 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md)、相关能力文档，并重新运行 smoke/build/typecheck。
