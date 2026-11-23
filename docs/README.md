# docs

`docs/` 保存项目级设计、POC、实施计划和审查记录。这里解释“为什么这样做”和“如何验收”，不替代源码中的接口契约。

## 目录职责

- `headless-core-poc.md`：早期运行时 POC 的历史启动、接口和验收说明。
- `superpowers/`：经过讨论确认的设计文档、计划和任务记录。
- 其他专题文档：记录架构决策、迁移步骤或测试结论。

## 维护边界

文档中的当前命令、路径和接口示例必须以当前源码为准。Nexum 协议字段以 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md) 为权威，变更流程以 [`openspec`](../openspec/README.md) 为权威。历史文档中的旧名称不参与构建。

## 验证

文档修改至少执行：

```bash
git diff --check
bunx prettier --check "docs/**/*.md"
```
