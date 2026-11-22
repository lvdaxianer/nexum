# @opencode/server

`@opencode/server` 是完整 OpenCode Server 的运行时服务组合，负责路由、鉴权、事件、文件和集成服务。它服务于原生 OpenCode 应用；Nexum 的独立 HTTP/SSE 入口见 [`nexum-server`](../nexum-server/README.md)。

## 目录职责

- `src/routes.ts`、`src/api.ts`：服务路由和 API 装配。
- `src/handlers.ts`、`src/fetch.ts`：请求处理和响应分发。
- `src/auth.ts`、`src/pairing.ts`：认证与配对。
- `src/event-feed.ts`：事件馈送。
- `src/` 其他模块：文件、作业、MCP、位置和运行时服务。
- `test/`：服务行为和集成回归测试。

Server 依赖 Core、Protocol、Schema 和 Util；接口契约优先复用 [`protocol`](../protocol/README.md)。

## 验证

```bash
bun test --cwd packages/server
bun run --cwd packages/server typecheck:tsc
```
