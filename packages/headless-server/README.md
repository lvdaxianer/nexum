# @opencode/headless-server

`@opencode/headless-server` 是 Headless Core 的 HTTP/SSE 适配层，为任意 Web、桌面端、TUI 或企业页面提供稳定的控制接口。

## 目录职责

- `src/main.ts`：本地开发启动入口。
- `src/index.ts`：服务装配和对外导出。
- `src/events.ts`：Session 事件发布和 SSE 订阅。
- `test/`：服务、协议、Skill API 和事件流测试。

生产入口 `src/main.ts` 使用 JSON 文件保存 Session 元数据和全局模型配置。默认文件为当前工作目录下的 `.headless/sessions.json` 与 `.headless/model-config.json`；部署时可通过 `OPENCODE_HEADLESS_DATA_DIR` 指向 release 之外的共享数据目录，或通过 `OPENCODE_HEADLESS_SESSION_FILE`、`OPENCODE_HEADLESS_MODEL_CONFIG_FILE` 指定完整文件路径。Session 文件只保存名称、工作目录、状态和时间戳；模型配置文件保存服务地址、模型名和凭据（权限为 `0600`），接口不会回显凭据值。

Server 只负责传输、Session 编排和事件投递，核心权限与工具规则由 [`headless-core`](../headless-core/README.md) 决定；参考页面位于 [`headless-ui`](../headless-ui/README.md)。

## 验证

```bash
bun test --cwd packages/headless-server
bun run --cwd packages/headless-server typecheck
```
