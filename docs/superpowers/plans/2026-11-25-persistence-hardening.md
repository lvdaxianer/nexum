# 持久化可靠性加固计划

> **执行约束：** 使用 `@superpowers:executing-plans`，逐项完成后运行受影响包测试和根目录 `bun run check`。

## 任务 1：先补可靠性回归测试

- 在 SQLite 测试中锁定目录/数据库私有权限、schema version、超量记录拒绝和原子 Session 删除行为。
- 在 Core 测试中锁定原子删除回调存在时不会再次调用 SessionStore.delete。
- 测试先失败，再实现。

## 任务 2：加固 SQLite 数据库边界

- 初始化私有目录和数据库/WAL 文件权限。
- 引入 `PRAGMA user_version` 迁移入口，拒绝未知版本。
- 为通用记录读取设置最大行数并返回稳定内部错误。
- 将交互记录按 Session 批量删除，移除逐条删除的 N+1。

## 任务 3：接通原子 Session 删除

- 在 Core 的 SessionService 选项中增加可选原子删除回调。
- 在 NexumPersistence 组合中暴露可选 Session 删除能力。
- SQLite 适配器使用单事务删除 Session、消息、交互和事件。
- Server 继续复用 SessionService 的状态检查和 caller-safe 错误映射。

## 任务 4：验证与交付

- 运行 `bun test`：`packages/nexum-core`、`packages/nexum-persistence-sqlite`、`packages/nexum-server`。
- 运行根目录 `bun run check`、`git diff --check` 和 OpenSpec strict validation。
- 完成代码审计后提交并合并回 `dev-v0.0.1`。
