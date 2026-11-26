# Tasks

## 1. Core execution contract

- [ ] 1.1 在 `nexum-core` 定义安全的 `NexumExecutionRecord`、`NexumExecutionStore`、恢复状态和配置上限；为 claim、终态、恢复 eligibility 写 contract 单测。
- [ ] 1.2 扩展 Coding Loop admission/settle/cancel/recover，使同一 Session 只保留一个本地 active claim，并在 Continue 恢复时不重复插入用户消息；通过 `run-lifecycle` 和 cancellation 单测验证。

## 2. Persistence and runtime recovery

- [ ] 2.1 为内存、文件和 SQLite persistence 增加 execution store；文件使用原子替换，SQLite 使用独立 record kind，并通过重启模拟测试验证 claim/attempt 恢复。
- [ ] 2.2 在 Application Runtime 组合器接入 execution store 和启动 recovery；验证一个坏 claim 不阻塞其他 Session，恢复失败写入安全诊断。

## 3. Protocol and Server surface

- [ ] 3.1 增加 recovery 状态的 Protocol DTO、Client 调用和 Server Session recovery 查询；验证响应不含路径、凭据、Prompt 原文和内部异常。
- [ ] 3.2 保持 Prompt/Continue/Cancel 的 accepted/conflict/terminal 兼容，并覆盖未知 Session、重复 admission、恢复耗尽和用户取消的稳定错误。

## 4. Integration verification

- [ ] 4.1 运行 Core/Application/Server/Client 受影响测试、`bun run check` 和 `openspec validate --strict`；记录环境基线失败并修复本变更引入的问题。
- [ ] 4.2 完成代码审查、依赖方向/敏感字段审计、工作树验证，提交并合并回 `dev-v0.0.1`。

## Workflow follow-up

- 完成实现和验收后归档 OpenSpec change，并验证归档后的主规格内容。
