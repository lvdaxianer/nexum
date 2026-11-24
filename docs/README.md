# docs

`docs/` 保存项目级设计、POC、实施计划和审查记录。这里解释“为什么这样做”和“如何验收”，不替代源码中的接口契约。

项目级总入口是根目录的 [`README.md`](../README.md)。本文档只说明 `docs/` 的目录职责和维护规则；面向前后端协作的 UI、能力和模块文档从根 README 的“文档导航”进入。

## 目录职责

- `headless-core-poc.md`：早期运行时 POC 的历史启动、接口和验收说明。
- `superpowers/`：经过讨论确认的设计文档、计划和任务记录。
- `architecture/`：当前架构边界和 Runtime 流程说明。
- `ui/`：UI 交互协议、状态和 Surface 行为说明。
- `capabilities/`：跨前后端能力语义和生命周期说明。
- `modules/`：每个 `packages/nexum-*` 模块的实现边界和接入说明，入口为 [`modules/README.md`](modules/README.md)。
- 其他专题文档：记录架构决策、迁移步骤或测试结论。

## 维护边界

文档中的当前命令、路径和接口示例必须以当前源码为准。Nexum 协议字段以 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md) 为权威，变更流程以 [`openspec`](../openspec/README.md) 为权威。历史文档中的旧名称不参与构建。

## 文档入口

- UI 交互：[交互协议](ui/interaction-protocol.md)、[状态](ui/states.md)、[Question](ui/question.md)、[Permission](ui/permission.md)。
- 能力语义：[Session](capabilities/session.md)、[Events](capabilities/events.md)、[Skills](capabilities/skills.md)、[MCP](capabilities/mcp.md)、[Integrations](capabilities/integrations.md)、[Model/Runtime](capabilities/model-runtime.md)、[Context/History](capabilities/context-and-history.md)。
- 模块实现：[模块文档索引](modules/README.md)。
- 对外接口：[`apis/nexum.md`](../apis/nexum.md)。

所有当前专题文档以“现状基线”标记，最后核对日期由根 README 和对应专题文档共同维护。

## 验证

文档修改至少执行：

```bash
git diff --check
bunx prettier --check "docs/**/*.md"
```
