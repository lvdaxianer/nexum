# @opencode/headless-ui

`@opencode/headless-ui` 是面向内部演示的企业级 Agent 工作台，也是 Headless API 的可替换参考 UI。它把模型、Session、Coding Loop、Function Calling、Permission、Question、Context Compaction、Skill 和事件时间线放在同一条演示路径中。

页面采用左侧配置与导航、中间 Coding Loop、右侧运行状态的三段式布局，中文为主，协议字段和事件类型保留原始标识。它只负责控制和展示，不承载 Core 的工具执行、权限决策或 Session 业务规则。

## 目录职责

- `src/main.tsx`：页面入口和控制面组件。
- `src/styles.css`：页面样式。
- `test/permission.smoke.spec.ts`：页面与权限流程的冒烟验证。
- `vite.config.ts`：本地开发和构建配置。

## 本地预览

先启动 Headless Server，再启动页面：

```bash
bun packages/headless-server/src/main.ts
bun run --cwd packages/headless-ui dev -- --host 127.0.0.1 --port 5173
```

打开 <http://127.0.0.1:5173>。如果只想检查空状态和布局，可以只启动页面；页面会明确显示 API 未连接，而不是显示空白。

它是可替换 UI，不是 Core 的组成部分；页面通过 [`@opencode/client`](../client/README.md) 调用 [`headless-server`](../headless-server/README.md)。

## 验证

```bash
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```
