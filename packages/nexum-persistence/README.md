# @nexum/persistence

Nexum 持久化适配器的公共组合契约层。这里定义 `NexumPersistence`、事件 Hub 端口和共享选项，不承载具体的内存、文件或 SQLite 实现。

## 实现包

- `@nexum/persistence-memory`：进程内存储，适合临时嵌入式运行和不需要恢复语义的 Core 单元测试。
- `@nexum/persistence-file`：JSON 文件存储，适合 CLI 和需要人工查看、备份的本地运行。
- `@nexum/persistence-sqlite`：SQLite 文件数据库，适合 Web/Server 和需要验证真实重启恢复的测试。

所有实现包都通过同一组 Core Store/Port 工作。数据库事务、文件原子写入、凭据存储和错误恢复策略属于具体实现包，不进入 Core。
