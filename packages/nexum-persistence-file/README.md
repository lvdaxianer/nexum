# @nexum/persistence-file

Nexum 的本地 JSON 文件适配器。

使用 `createFilePersistence({ dataDirectory })` 创建组合。Session、消息、事件、权限、Memory、Skill 和 MCP 状态保存在同一数据目录下的独立 JSON 文件中。

该适配器是 CLI 本地运行的默认后端，保留逐文件路径覆盖和原子写入行为。它不会自动把历史 JSON 数据迁移到 SQLite。
