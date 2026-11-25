# @nexum/persistence

Nexum Core Port 的默认持久化实现层。这里放文件/内存 Store、Event Hub 和可恢复状态，不承载 Skill、Tool 或 Runtime 业务编排。

当前实现包括 Session、Message、Interaction、Model Config、Role Prompt、Permission Policy 规则、Skill 注册状态、Event 和 Memory。策略判定仍由 Core 负责；本包只保存规则状态。

## 持久化组合

运行时可以通过组合工厂选择存储场景：

- `createFilePersistence({ dataDirectory })`：CLI 和本地运行，所有文件 Store 使用同一数据目录。
- `createMemoryPersistence()`：测试和临时嵌入式运行，所有 Store 只存在于当前进程。

Web 数据库实现应实现同样的 `NexumPersistence` 组合边界；数据库事务、租户隔离和迁移策略属于具体数据库适配器，不进入 Core。
