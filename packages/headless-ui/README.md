# @opencode/headless-ui

`@opencode/headless-ui` 是 Headless API 的最小参考控制台，用来验证模型、Session、Permission、Question、Skill 和事件时间线等链路。

## 目录职责

- `src/main.tsx`：页面入口和控制面组件。
- `src/styles.css`：页面样式。
- `test/permission.smoke.spec.ts`：页面与权限流程的冒烟验证。
- `vite.config.ts`：本地开发和构建配置。

它是可替换 UI，不是 Core 的组成部分；页面通过 [`@opencode/client`](../client/README.md) 调用 [`headless-server`](../headless-server/README.md)。

## 验证

```bash
bun run --cwd packages/headless-ui typecheck:tsc
bun run --cwd packages/headless-ui build
bun run --cwd packages/headless-ui test:smoke
```
