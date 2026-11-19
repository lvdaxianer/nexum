# Proposal

## Why

当前 Headless Core 已能完成模型调用、工具执行、权限审批、Question、上下文压缩和项目上下文加载，但页面仍主要是 POC 展示面板，无法完整承担任务控制台职责。需要把模型连接检查、Session 选择与事件恢复、运行状态和人工决策统一收敛到页面，确保用户不需要直接操作终端或底层 API。

## What Changes

- 增加页面可操作的模型连接检查，覆盖普通文本响应和 Function Calling 能力，并只返回安全状态。
- 增加 Session 列表与当前 Session 切换，页面可以恢复事件流、刷新权限和 Question 队列。
- 增加页面级运行控制：创建 Session、发送 Prompt、取消运行、重新连接事件流和刷新运行状态。
- 将权限请求、Question、工具调用结果、上下文压缩和项目上下文统一组织为可操作的控制台区域。
- 为异步操作补齐进行中、成功、失败、取消和断线恢复反馈，避免重复提交和静默丢失状态。
- 扩展 Headless 协议、客户端生成接口、服务端测试和 UI 端到端测试。

## Capabilities

### New Capabilities

- `headless-session-control`: 页面通过稳定的 Session 与事件接口创建、选择、恢复和停止 Coding Task。
- `headless-runtime-control`: 页面通过安全模型探测、权限队列、Question 队列和运行上下文状态控制 Headless Runtime。

### Modified Capabilities

无。

## Impact

- 修改 `packages/headless-core` 的 Session 查询能力与模型探测适配。
- 修改 `packages/headless-server` 和 `packages/protocol` 的 Headless API，并重新生成客户端接口。
- 修改 `packages/headless-ui` 的页面状态、操作控件、事件恢复和响应式布局。
- 增加服务端、客户端和 Playwright smoke 覆盖；不引入新的运行时依赖。
- 模型凭据继续只保存在服务端，页面和 SSE 事件不得返回凭据值。
