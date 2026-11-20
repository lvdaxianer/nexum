# docs

`docs/` 保存项目级设计、POC、实施计划和审查记录。这里解释“为什么这样做”和“如何验收”，不替代源码中的接口契约。

## 目录职责

- `headless-core-poc.md`：Headless Core POC 的启动、接口和验收说明。
- `superpowers/`：经过讨论确认的设计文档、计划和任务记录。
- 其他专题文档：记录架构决策、迁移步骤或测试结论。

## 维护边界

文档中的命令、路径和接口示例必须以当前源码为准。协议字段以 [`packages/protocol`](../packages/protocol/README.md) 为权威，变更流程以 [`openspec`](../openspec/README.md) 为权威。

## 验证

文档修改至少执行：

```bash
git diff --check
bunx prettier --check "docs/**/*.md"
```
