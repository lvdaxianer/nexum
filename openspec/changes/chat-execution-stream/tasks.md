# Tasks

## 1. 聊天消息投影

- [x] 1.1 先补充 ChatItem smoke 断言，覆盖用户 Prompt、Agent 文本和工具执行卡片；验证：新增断言在旧事件日志实现上按预期失败
- [x] 1.2 实现 Session 内 ChatItem 投影、事件去重、Agent 文本追加和工具卡片状态更新；验证：新增 smoke 与现有权限/Question/Skill 流程通过
- [x] 1.3 将 Prompt 提交、Session 完成/失败/取消和 SSE 断线映射为聊天消息或状态卡片；验证：取消、失败和重连场景保留对话并可继续输入

## 2. 聊天主视图与交互

- [x] 2.1 将 Coding Loop 主区改为聊天消息布局，支持消息、执行卡片、结构化详情和进行中状态；验证：浏览器首屏可看到用户消息、Agent 回复和工具调用层级
- [x] 2.2 将 Permission、Question、Context Compaction、Skill 状态嵌入聊天流并保留右侧运行状态；验证：各卡片操作有 busy/disabled、成功、失败和恢复反馈
- [x] 2.3 完善桌面/窄屏样式、空状态、滚动、键盘发送和减少动画偏好；验证：窄屏无横向滚动且 Prompt 可继续提交

## 3. 文档与集成验证

- [x] 3.1 更新 Headless UI README，说明聊天流、执行卡片和事件映射；验证：文档命令与当前页面结构一致
- [x] 3.2 启动 Vite UI 与 Headless Server 做浏览器验收，执行类型检查、构建、smoke、OpenSpec strict 和代码审查；验证：全部命令通过且主流程可见
- [x] 3.3 提交任务分支并合并回 `dev-v0.0.1`，清理任务 worktree；验证：主分支干净、任务分支已合并、服务可按 README 启动
