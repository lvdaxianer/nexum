# 持久化可靠性加固

默认 Web Runtime 使用 SQLite 持久化 Session、消息、事件和凭据，但当前数据库初始化、通用记录读取和跨 Store 删除缺少统一的可靠性边界。异常写入或删除可能留下部分数据，数据库文件也没有显式私有权限和 schema 版本约束。

本变更为 SQLite 增加私有文件边界、schema 版本检查、有界读取和原子 Session 删除；同时保留内存和文件适配器的既有职责。

## 影响

- `@nexum/core`：SessionService 支持可选原子删除回调。
- `@nexum/persistence`：持久化组合暴露可选原子删除能力。
- `@nexum/persistence-sqlite`：数据库权限、迁移、读取上限和事务删除。
- 测试与文档：补充崩溃恢复、权限和删除一致性契约。
