# @opencode/core

`@opencode/core` 是原 OpenCode 应用使用的运行时服务集合，承载文件、Session、Provider、MCP、插件和其他基础服务。它属于完整 OpenCode Server 的内部运行时，不是本次抽离的 UI 无关 Headless Core。

## 目录职责

- `src/`：运行时服务和领域模块。
- `test/`：服务行为和回归测试。
- `script/`：构建及辅助脚本。

完整 Server 通过 [`server`](../server/README.md) 组合这里的能力；新的跨 UI Coding Loop 接入应使用独立的 [`nexum-core`](../nexum-core/README.md)，避免把原应用装配层带入新 UI。

## 验证

```bash
bun test --cwd packages/core
bun run --cwd packages/core typecheck:tsc
```
