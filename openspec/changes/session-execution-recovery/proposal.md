# Proposal

## Why

当前 Nexum 的运行互斥和取消状态主要存在于进程内；服务重启后只能把 `running` Session 退回 `idle`，无法区分“没有运行”和“进程中断后需要恢复”的任务。这样会丢失恢复上下文、无法审计尝试次数，也容易让重试重复提交用户 Prompt。

## What Changes

- 为每个被接受的 Prompt/Continue 生成并持久化 execution claim，记录 Session、模式、状态、尝试次数和安全时间戳。
- 将 claim 的本地占用与未来集群所有权明确分离：claim 只用于恢复标记和进程内防重，不提供跨节点 fencing 或 exactly-once 保证。
- 启动时扫描未终结 claim，仅对 canonical history 可继续的 Session 执行有限恢复；恢复使用同一 Session 上下文，不重复插入用户消息。
- 正常完成、失败和用户取消释放/终结 claim；进程退出或非正常关闭保留 `running` claim，供下次启动恢复。
- 暴露 caller-safe 的 execution/recovery 状态查询，隐藏内部锁、文件路径、凭据和原始异常。
- 保持现有 Session、Permission、Question、Tool 和事件顺序语义，并补齐 Core、Persistence、Application、Protocol、Server 的集成测试。

## Capabilities

### New Capabilities

- `session-execution-recovery`: 持久化运行 claim、恢复尝试和安全恢复状态。

### Modified Capabilities

- `headless-session-control`: 增加 execution/recovery 状态查询与重启后可观察的运行语义。

## Impact

- Affected code: `packages/nexum-core` 的 Coding Loop/Runtime，`packages/nexum-persistence` 的内存/文件组合，SQLite Store，Application Runtime 组合，以及 Protocol/Server/Client 的状态查询。
- Existing HTTP prompt/continue/cancel routes keep their current accepted/conflict/error contracts; recovery status is additive.
- No new external dependency, database migration framework, cluster coordinator, or UI-specific execution logic is introduced.
