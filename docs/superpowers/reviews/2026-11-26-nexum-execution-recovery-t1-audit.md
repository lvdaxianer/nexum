# Session Execution Recovery T1 审查记录

## 范围

- `nexum-core` 新增本地 ExecutionStore 端口、claim/settle、恢复尝试上限和幂等恢复扫描。
- Memory/File/SQLite persistence 持久化执行声明；Session 删除同步清理声明。
- Runtime 组合器接入 Store；Server 在 Skill/MCP 初始化后启动恢复。
- Protocol/Client/Server 暴露 caller-safe recovery DTO 和 Session 查询接口。

## 验收证据

- Core：恢复不重复 canonical user message、不可继续进入等待态、达到上限进入耗尽态、坏 claim 不阻塞其他 Session；`run-lifecycle` 保持通过。
- Persistence：File Store 跨实例重启、Memory attempt 递增。
- SQLite：跨数据库 reopen、独立 `execution` record kind、Session 原子删除清理。
- Server Protocol：恢复查询只返回 execution ID、状态、attempt、时间戳和 recoverable，不返回路径、凭据、Prompt 原文或原始异常。

## 设计边界

Execution claim 只表示单进程本地恢复标记，不提供跨进程 ownership、fencing 或 exactly-once。恢复使用 canonical history 的 Continue 语义；没有 user/tool 尾消息时不自动调用模型。

## 待完成

完整受影响套件、根目录 `bun run check`、OpenSpec strict 校验均已通过；合并前继续复核依赖方向和敏感字段。
