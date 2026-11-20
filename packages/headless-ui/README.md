# @opencode/headless-ui

`@opencode/headless-ui` 是面向内部演示的企业级 Agent 工作台，也是 Headless API 的可替换参考 UI。它把模型、Session、聊天式 Coding Loop、Function Calling、Permission、Question、Context Compaction、Skill 和事件时间线放在同一条演示路径中。

页面采用左侧导航、中间聊天主视图、右侧运行状态的三段式布局；模型服务和 Skills 从左侧导航以抽屉形式打开（基于 Kobalte Dialog 的左侧面板）。中间区域会依次展示用户 Prompt、Agent 流式文本，以及 Skill、工具调用、工具结果、权限、补充信息、上下文压缩和 Session 状态卡片；底部保留可展开的原始事件明细，便于演示和排障。页面中文为主，协议字段和事件类型保留原始标识。

它只负责控制和展示，不承载 Core 的工具执行、权限决策或 Session 业务规则。聊天条目是前端对 SSE 事件的可读投影，事件通过 `eventID` 去重，工具和请求卡片通过对应的 request/tool ID 更新。

## 目录职责

- `src/main.tsx`：页面入口、聊天条目投影和控制面组件。
- `src/drawer.tsx`：基于 Kobalte Dialog 的右侧抽屉组件。
- `src/styles.css`：页面样式。
- `test/permission.smoke.spec.ts`：页面、聊天过程和权限流程的冒烟验证。
- `vite.config.ts`：本地开发和构建配置。

## 本地预览

先启动 Headless Server，再启动页面：

```bash
bun packages/headless-server/src/main.ts
bun run --cwd packages/headless-ui dev -- --host 127.0.0.1 --port 5173
```

打开 <http://127.0.0.1:5173>。如果只想检查空状态和布局，可以只启动页面；页面会明确显示 API 未连接，而不是显示空白。

创建 Session 并发送 Prompt 后，中间区域会显示类似下面的过程：

```text
你：按照接口文档生成指标视图
Agent：我先读取 Skill 和项目上下文……
执行卡片：Skill 已激活
执行卡片：工具调用 / 工具结果
执行卡片：权限请求 / 补充信息
Agent：校验完成，准备生成结果
状态卡片：运行完成
```

它是可替换 UI，不是 Core 的组成部分；页面通过 [`@opencode/client`](../client/README.md) 调用 [`headless-server`](../headless-server/README.md)。

## 验证

```bash
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```
