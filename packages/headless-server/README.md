# @opencode/headless-server

`@opencode/headless-server` 是 Headless Core 的 HTTP/SSE 适配层，为任意 Web、桌面端、TUI 或企业页面提供稳定的控制接口。

## 目录职责

- `src/main.ts`：本地开发启动入口。
- `src/index.ts`：服务装配和对外导出。
- `src/events.ts`：Session 事件发布和 SSE 订阅。
- `test/`：服务、协议、Skill API 和事件流测试。

Server 只负责传输、Session 编排和事件投递，核心权限与工具规则由 [`headless-core`](../headless-core/README.md) 决定；参考页面位于 [`headless-ui`](../headless-ui/README.md)。

## 验证

```bash
bun test --cwd packages/headless-server
bun run --cwd packages/headless-server typecheck
```
