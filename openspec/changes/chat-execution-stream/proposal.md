# Proposal

## Why

当前 Headless UI 能接收 Core 的 SSE 事件，但用户看到的是事件日志，无法像 OpenCode 终端一样理解“我提出了什么任务、Agent 正在做什么、调用了哪些工具、下一步是什么”。这会削弱内部演示对权限、Skill、上下文压缩和 Coding 链路的说明能力，因此需要把执行事件组织成可读的聊天式 Agent 过程。

## What Changes

- 将中间主区域从单一事件日志调整为聊天主视图。
- 展示用户 Prompt、Agent 文本回复和持续到达的流式消息。
- 将 Skill、文件搜索、工具调用、工具结果、权限请求、补充信息、上下文压缩和失败状态渲染为聊天流中的执行卡片。
- 保留右侧运行状态、Context 用量、连接状态和实时事件摘要。
- 保留原有 Session、Model、Prompt、SSE、取消和权限处理能力，不改变 Headless Core API 契约。
- 为聊天主视图补充空状态、加载中、运行中、失败、取消和恢复连接反馈。

## Capabilities

### New Capabilities

- `headless-chat-stream`: 定义 Headless UI 如何把用户消息、Agent 回复和 Core 执行事件组织为可追踪的聊天式运行流。

### Modified Capabilities

- 无

## Impact

- 主要影响 `packages/headless-ui/src/main.tsx`、`packages/headless-ui/src/styles.css` 和 smoke 测试。
- 增加前端本地消息投影，不新增后端接口，不修改 Core、SSE 或权限协议。
- 需要验证事件去重、流式文本追加、权限/问题卡片状态、取消恢复和窄屏布局。
