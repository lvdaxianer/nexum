# Proposal

## Why

运行结束事件已经到达时，ChatSurface 顶部会显示“已完成”，但同一轮的模型尝试和 Agent 输出卡片仍显示“执行中/输出中”，宿主左侧 Session 列表也可能继续显示旧状态。这会让用户误以为任务仍在运行，并且无法判断哪些状态可信。

## What Changes

- 终态事件到达后，统一收敛当前 run 的思考、Agent 输出和模型执行卡片。
- ChatSurface 向宿主通知 Session 的终态变化，宿主按稳定 Session ID 增量更新列表项。
- 补充完成、失败和取消场景的投影与宿主同步测试。
- 不修改 Protocol 事件类型、HTTP 路由或后端运行语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `chat-surface`: 终态事件需要收敛同一 run 的可见执行状态，并向宿主暴露终态通知。
- `headless-session-control`: 页面 Session 列表需要在运行终态事件到达后增量反映最新状态。

## Impact

- 代码：`packages/nexum-chat-surface/src/chat-surface.tsx`、`packages/nexum-chat-surface/src/index.ts`、`packages/nexum-chat-surface/test/chat-projection.test.ts`、`packages/nexum-surfaces/src/main.tsx` 及宿主测试。
- 契约：新增可选的 ChatSurface 状态回调，不影响现有宿主调用；不新增 Protocol 或 HTTP API。
- 运行时：仅调整前端投影与宿主本地列表合并，保持服务端事件顺序和 Session 持久化语义不变。
