# @nexum/cli

Nexum 的终端 Surface，与 Web UI 同级。它复用 `@nexum/surface-adapter` 的协议契约和 `@nexum/client`，提供 REPL、思考动画、Permission/Question 交互问答和 session/model/skill/mcp 等管理面命令，不依赖 Core 或 Server 内部实现。

```bash
# 查看全部命令
bun packages/nexum-cli/src/main.ts --help

# 或通过 package script
bun run --cwd packages/nexum-cli start -- --help

# 连接 Server 后进入 REPL
bun packages/nexum-cli/src/main.ts --server http://127.0.0.1:4097
```

模块职责、命令表、终端能力分层和测试入口见 [`docs/modules/nexum-cli.md`](../../docs/modules/nexum-cli.md)。
