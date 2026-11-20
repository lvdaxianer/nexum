# Design

## Context

当前 `packages/headless-ui` 已经维护 Session、SSE 事件、权限、补充信息、上下文压缩和 Skill 状态，但主区域把这些信息直接作为事件日志展示。新的交互需要保持现有 Headless Core API 不变，只在前端增加一层“运行事件到聊天消息”的投影。

## Goals / Non-Goals

**Goals:**

- 以聊天消息为主线呈现一次 Coding 运行。
- 将事件按稳定 ID 去重，并把同一轮 Agent 文本合并为可持续更新的消息。
- 将工具、权限、问题、Skill 和上下文状态作为消息内执行卡片展示。
- 保持现有权限处理、补充信息提交/取消、Session 取消和 SSE 重连行为。
- 在桌面和窄屏下保持消息与 Prompt 输入可用。

**Non-Goals:**

- 不修改 Headless Core、SSE 事件协议或后端 API。
- 不实现完整 Markdown 编辑器、文件附件、代码 diff 或消息持久化。
- 不把模型原始思考内容作为独立的“思维链”暴露；只展示 Core 已公开的状态和执行摘要。

## Decisions

### 1. 使用前端 ChatItem 投影层

在页面状态中新增统一的 `ChatItem` 集合，类型覆盖 `user`、`assistant`、`tool`、`permission`、`question`、`context`、`skill`、`status`。用户发送 Prompt 时先追加 user item；SSE 事件通过事件类型和关联 ID 更新已有 item 或新增执行 item。

选择这个方案是因为它能保留现有事件状态，同时让 UI 不依赖后端返回完整聊天记录。替代方案是直接把 SSE 事件逐条渲染为日志，改动小但无法表达连续 Agent 回复；另一个方案是新增后端 transcript API，语义完整但超出本次 UI 迭代且会扩大协议变更范围。

### 2. Agent 文本采用增量合并，工具事件独立成卡片

同一 Session 中相邻且属于同一运行轮次的 `assistant.text` 事件合并到当前 Agent item；工具请求和结果保留独立卡片，并使用 `eventID`/工具调用 ID 去重。卡片默认展示摘要，结构化 payload 通过折叠详情查看，避免聊天区域被 JSON 撑满。

### 3. 权限与补充信息卡片直接承载动作

权限卡片继续复用现有 allow/deny 操作，问题卡片继续复用选项选择、提交和取消操作。动作期间按钮进入 busy/disabled 状态，失败时保留用户已选输入并展示可重试反馈。

### 4. 桌面三栏、窄屏单主栏

桌面布局保持左侧 Session/配置、中间聊天主视图、右侧运行状态；窄屏隐藏或折叠右侧状态，将聊天和 Prompt 作为首要内容。执行卡片使用明显的状态颜色和时间线标识区分普通消息。

## Risks / Trade-offs

- [事件关联信息不足] → 使用 `eventID`、工具调用 ID、request ID 和当前运行轮次组成稳定键；无法关联的事件作为独立状态卡片展示。
- [长时间运行导致 DOM 膨胀] → 聊天条目和原始事件都限制保留最近窗口，详情按需展开。
- [SSE 重连重复消息] → 继续使用现有 `seenEventKeys`，ChatItem 更新必须经过同一去重入口。
- [模型输出含敏感信息] → UI 只展示 Core 已返回的内容，凭据字段仍使用密码输入且不进入 ChatItem；工具详情默认摘要化。

## Migration Plan

1. 先增加聊天流 smoke 断言，确保旧权限、Question、Skill 和 Session 流程仍然受覆盖。
2. 在页面中加入 ChatItem 投影和聊天主视图，保留旧事件集合供右侧摘要使用。
3. 启动 Headless Server 与 Vite UI，使用浏览器完成一次 Prompt、工具事件、权限/问题状态和取消验证。
4. 若运行异常，回滚到本次任务提交即可；不涉及数据库或协议迁移。
