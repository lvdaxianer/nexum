# @nexum/persistence-sqlite

Nexum 的 SQLite 数据库适配器。

使用 `createSqlitePersistence({ databasePath })` 创建组合。首次打开数据库时会自动初始化 schema；关闭后再次使用同一个数据库文件可以恢复已提交的 Session、消息、事件、权限和其他 Runtime 状态。

Web/Server 默认使用 `.nexum/nexum.db`。测试必须为每个 Runtime 使用独立临时数据库，不能共享开发数据库或固定测试文件。
