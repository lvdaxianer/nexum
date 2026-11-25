# @nexum/persistence-memory

Nexum 的进程内存储适配器。

- 不创建文件或 SQLite 数据库。
- 每次创建 Persistence 组合都会得到独立状态。
- 适合临时嵌入式运行和不验证重启恢复的快速测试。
- 测试默认使用 `@nexum/persistence-sqlite`，避免把内存行为误当作持久化行为。

使用 `createMemoryPersistence()` 创建完整的 `NexumPersistence` 组合。
