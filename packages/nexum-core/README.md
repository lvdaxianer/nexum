# @nexum/core

`@nexum/core` 是 UI 无关的 Coding Agent 核心。它承载模型适配、Coding Loop、Function Calling、工具执行、权限、Question、上下文压缩、项目上下文和 Skill 注册/调用等生产链路能力。

## 目录职责

- `src/model.ts`、`src/model-config.ts`：模型端口、OpenAI-compatible 配置和探测。
- `src/tools.ts`：工具定义、参数校验、工作目录边界和执行。
- `src/permission.ts`：Session 隔离的权限请求与决策。
- `src/context.ts`：上下文预算、压缩和恢复状态。
- `src/skill-registry.ts`、`src/skill-invocation.ts`：Skill 发现、校验和调用。
- `src/runtime.ts`、`src/memory.ts`、`src/host.ts`：Runtime 生命周期、Memory 和 Host 能力端口。
- `src/index.ts`：对外导出；`test/` 覆盖核心能力契约。

该包不依赖具体 UI 或 HTTP 框架。页面、TUI 和其他控制面应通过 [`@nexum/server`](../nexum-server/README.md)、默认适配器，或直接实现 Core 端口接入。

## 验证

```bash
bun test --cwd packages/nexum-core
bun run --cwd packages/nexum-core typecheck
```
