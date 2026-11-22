# @opencode/cli

`@opencode/cli` 是 OpenCode 的命令行分发和进程入口，负责把 Server、TUI、开发宿主和打包产物连接起来。

## 目录职责

- `src/`：CLI 启动、环境、Server 进程和运行时适配。
- `bin/`：发布后使用的 `opencode` 和 `opencode2` 可执行入口。
- `dev/`：本地开发宿主，详见 [`dev/README.md`](dev/README.md)。
- `script/`：构建、打包、资源和产物校验脚本。

CLI 是装配层，不应把核心 Coding Loop 或页面业务复制到这里。Nexum 集成优先依赖 [`nexum-server`](../nexum-server/README.md)，而不是把 Nexum Core 直接塞进 CLI。

## 验证

```bash
bun run --cwd packages/cli typecheck:tsc
bun test --cwd packages/cli
```
