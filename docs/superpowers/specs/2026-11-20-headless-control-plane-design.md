# Headless Control Plane 设计

## 目标

把 `packages/headless-ui` 从 POC 展示面板提升为页面唯一控制台：用户可以在页面配置模型、管理 Session、发起和停止任务、处理权限与 Question，并观察工具、上下文压缩和项目上下文状态。

## 约束

- Headless Core 不依赖任何 UI 包。
- 浏览器只访问 Headless Server；模型凭据只在服务端保存和使用。
- SSE 事件必须脱敏，页面不显示完整凭据或未脱敏工具输出。
- 页面状态改变操作必须具备进行中、成功、失败、取消和断线恢复反馈。

## 设计

```text
Control Room UI
  ├─ Model config / Probe
  ├─ Session list / Prompt / Cancel / Reconnect
  ├─ Permission queue / Question queue
  └─ Timeline / Context status
          │ HTTP + SSE
Headless Server
  ├─ Session service
  ├─ Model probe
  └─ Coding Loop
          │ ports
Headless Core → Model / Tools / Permission / Question / Context
```

服务端新增只读 Session 列表和安全模型 Probe 入口。Probe 只返回能力状态，不返回模型内容；页面将当前 Session ID 存入 `sessionStorage`，刷新后拉取列表并重连 SSE，按 `sessionID + sequence` 去重事件。

页面采用单页分区布局，所有变更操作独立维护 busy 状态。权限默认保持人工审批，页面提供 `allow_once`、`allow_always` 和 `deny`；Core 继续负责权限边界和实际工具执行。

## 验收

- Core、Server、Protocol、Client 类型检查和定向测试通过。
- 页面可完成模型 Probe、Session 创建/切换、Prompt、取消、重连、权限、Question 和上下文状态查看。
- Playwright smoke 覆盖成功、失败、取消、重复点击、断线恢复和脱敏。
- 真实 UINO 模型 smoke 继续覆盖文本与 Function Calling。
