# Design

## Context

See `proposal.md` for the motivation. 当前 Core 的 `activeRuns` 和 `continuationAdmissions` 只存在于单个 Coding Loop 实例；SessionStore 恢复时会把 `running` 映射为 `idle`，消息历史和事件是可持久化的，但没有 execution 级事实记录。

## Goals / Non-Goals

**Goals:**

- 将 admission、运行 claim、终态和恢复尝试计数分成可测试的 Port。
- 让 File/SQLite/Memory persistence 都能保存 claim，并在 Runtime 启动时发现中断记录。
- 以 canonical message history 作为恢复上下文来源，恢复采用 Continue 语义，避免重复用户消息。
- 给 HTTP/Client 一个不泄露内部实现的 recovery DTO。

**Non-Goals:**

- 不实现跨节点锁、租约 fencing、分布式队列或 exactly-once 执行。
- 不把思考心跳、SSE 连接或 UI loading 写入 durable claim。
- 不在本 change 引入新的 Provider、Host/Sandbox 或 Automation 调度器。

## Decisions

1. **Claim 独立于 SessionRecord。** Session 状态继续表达用户可见生命周期，ExecutionRecord 表达一次运行的恢复事实；这样历史消息、Session 删除和恢复尝试可以分别演进。
2. **Recovery 使用 `continue`。** Prompt admission 先把用户消息落入 canonical history；进程中断后只要末条是 user/tool，就从已有 history 继续，不再次写入 prompt。没有可继续上下文时只标记等待人工，不自动调用模型。
3. **由 Store 原子 claim。** Store 提供 `claim`/`settle`/`list` 边界；Memory 用单进程 Map，File 用原子 JSON 替换，SQLite 用单条记录写入。该原子性只保证同一持久化实例的本地 admission，不宣称集群 fencing。
4. **恢复在 Runtime 创建后显式启动。** Application 组合器调用 Loop 的 `recover`，Server 在接收请求前等待恢复扫描完成；恢复失败记录在 claim 中，不阻塞其他 Session。
5. **Recovery DTO 只返回安全字段。** Protocol/Server 暴露 execution ID、状态、attempt、是否可恢复和时间戳；不暴露存储路径、锁对象、异常堆栈或 Prompt 原文。

## Risks / Trade-offs

- [进程在模型请求外崩溃] → claim 可能保留 running；启动扫描用 history 判断是否可继续，并以 durable attempt 上限阻止无限恢复。
- [恢复与旧进程重叠] → 本 change 不提供跨进程 fencing；部署方必须保证单个本地数据目录只由一个 Runtime 进程使用，并在 DTO/文档中明确限制。
- [终态事件写入失败] → 先记录 Session 终态和 claim 状态，事件仍沿用当前 best-effort 语义；客户端可通过 recovery/status 查询纠正投影。
- [旧数据无 execution 表] → Store 读取空集合并保持现有 Session 行为，不把历史 `running` 自动误判成可恢复任务。

## Migration Plan

1. 先加入空兼容的 ExecutionStore 和内存/文件/SQLite 实现。
2. 将 Loop admission、终态、取消和 recovery 接入 claim；旧调用方不传 recovery 参数时使用默认上限。
3. 增加 Protocol/Server/Client 状态查询；已有 Prompt/Continue/Cancel 路由保持兼容。
4. 使用现有数据目录创建新的 execution records；回滚时保留记录但关闭自动恢复入口，不删除 Session/Message/Event 数据。

## Open Questions

- 未来做多进程部署时，是否需要把 claim 升级成带 lease/fencing token 的分布式 ownership；本 change 明确不预留可误用的伪实现。
