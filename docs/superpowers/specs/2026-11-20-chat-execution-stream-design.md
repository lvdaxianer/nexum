# 聊天式 Agent 执行流设计

## 背景

当前 Headless UI 可以接收 Core 的 SSE 事件，但用户看到的是事件日志，无法快速理解 Prompt、Agent 回复、工具调用和权限等待之间的关系。本次设计把中间区域改造成聊天主视图，同时保留运行状态和原始事件能力。

## 方案

采用“聊天消息 + 执行卡片 + 运行状态”的三层结构：

1. 用户 Prompt 以用户消息出现。
2. Agent 文本以可持续追加的 Assistant 消息出现。
3. Skill、工具、权限、补充信息、上下文压缩和失败状态作为 Assistant 消息下的执行卡片出现。
4. 左侧保留 Session、模型配置和 Skill 导航；右侧保留 Context、连接状态和实时事件摘要。
5. 窄屏时收起右侧状态，优先保证聊天和 Prompt 输入。

## 数据流

SSE 事件先经过现有的 `eventID` 去重，再投影到前端 ChatItem：文本事件追加到当前 Assistant item；工具、权限和问题事件按 request/tool ID 创建或更新卡片；Session 完成、失败、取消和断线事件创建状态卡片。原始事件仍保留给右侧摘要和调试详情使用。

## 边界

本次只改 `packages/headless-ui` 的前端展示和测试，不改 Headless Core、SSE 协议或后端接口。不暴露模型隐藏思维链，只展示 Core 已公开的文本、执行摘要和状态。

## 验收

- 页面可以连续看到用户 Prompt、Agent 回复和工具执行过程。
- 权限请求、补充信息、上下文压缩、Skill 事件能插入聊天流并显示状态。
- SSE 重连不会重复消息，取消和失败后仍可继续输入。
- `typecheck`、build、smoke 测试通过，并能启动本地服务进行浏览器验证。
