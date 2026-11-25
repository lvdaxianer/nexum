# 持久化适配器组合设计

## 目标

同一套 Nexum Core/Application 需要支持三类运行场景：CLI 使用本地文件，Web 使用数据库，测试使用进程内存。场景差异应停留在 Runtime 组合根，不应进入 Core 业务逻辑。

## 组合边界

持久化组合统一承载以下端口：Session、Message、Interaction、ModelConfig、RolePrompt、PermissionPolicy、Memory、EventHub、Skill 注册、MCP 配置和 MCP 凭据。每个具体实现仍保留原有端口语义，组合层只负责创建和装配。

当前提供：

- `createFilePersistence()`：CLI/本地运行，默认使用 `.nexum` 下的多个 JSON 文件。
- `createMemoryPersistence()`：测试/嵌入式运行，不写本地文件。
- 数据库组合沿用同一 `NexumPersistence` 边界，待数据库选型和事务模型明确后实现。

## 运行时接入

`createEmbeddedRuntime({ persistence })` 接收组合对象；`createLocalRuntime()` 默认创建文件组合。保留单项 Store 参数作为兼容和测试覆盖入口，单项显式注入优先于组合默认值。

## 约束

- Core 不能依赖文件、数据库或具体 ORM。
- 凭据通过独立 Store 管理，安全返回不得包含凭据明文。
- EventHub 同时负责历史回放和实时订阅，不能被当作普通 CRUD 表替代。
- 多实例 Web 的事件广播、数据库迁移和密钥管理不在本次组合层改造内。
