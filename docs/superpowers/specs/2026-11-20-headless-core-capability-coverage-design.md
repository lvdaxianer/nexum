# Headless Core 能力覆盖设计

## 目标

在现有 Headless POC 上补齐 OpenCode 核心行为的可重复验收，重点覆盖 Function Calling、上下文压缩、权限审批、Question 补充信息和项目上下文注入。

## 设计

新增三个可替换端口：

- `ContextCompactionPort`：控制阈值、摘要和最近消息保留。
- `QuestionPort`：管理 pending question、回答、取消和 tool result。
- `ProjectContextPort`：加载 instructions、skill、reference，并按来源去重和恢复。

所有交互最终进入统一 `ModelMessage` 历史。模型请求前先完成上下文估算/压缩；模型 Question 调用会暂停到 UI 回答；工具执行始终位于 PermissionPort 之后。事件通过 SSE 暴露，UI 不直接读取文件、执行 Shell 或调用模型。

## 验收矩阵

| 能力             | Core                          | Server             | UI         |
| ---------------- | ----------------------------- | ------------------ | ---------- |
| Function Calling | 单/多工具、结果续跑、非法参数 | fixture 多轮请求   | 工具时间线 |
| 上下文压缩       | 阈值、摘要、保留、失败        | 压缩事件和继续运行 | 压缩状态   |
| 权限             | allow/deny/cancel/脱敏        | pending/reply      | 审批按钮   |
| 补充信息         | Question 状态机               | list/reply/cancel  | 问题表单   |
| 项目上下文       | 注入/去重/恢复                | 来源事件           | 来源展示   |

## 约束

- 测试 fixture 不访问真实凭据。
- 真实模型 smoke 只从环境变量读取凭据，不写入仓库或日志。
- 不迁移完整 OpenCode Core 的数据库、MCP、PTY、Subagent 或 Worktree。
