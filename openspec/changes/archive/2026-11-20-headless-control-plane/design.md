# Design

## Context

现有 Headless Runtime 已通过单一 ModelPort、Coding Loop、Permission Broker、Question Broker 和 SSE EventHub 完成核心编排；UI 已能发送 Prompt 和处理部分 pending 状态，但服务端没有统一的 Session 查询与模型能力探测入口，页面也没有恢复任务所需的完整控制状态。

实现必须继续保持 Core 不依赖 UI，服务端是唯一的凭据边界，SSE 只发布脱敏事件，且不能因为页面重复点击或断线重连而重复执行工具。

## Goals / Non-Goals

**Goals:**

- 为页面提供完整、稳定、可恢复的 Session 控制面。
- 让页面能验证当前模型的文本和 Function Calling 能力。
- 让权限、Question、工具结果、上下文压缩和项目上下文都有可见状态和可操作入口。
- 让异步操作在 pending、成功、失败、取消和断线时保持一致反馈。

**Non-Goals:**

- 不重写 Headless Core 的 Coding Loop，不在 UI 中实现工具执行。
- 不增加多 Provider fallback、远程持久化 Session 或多用户认证。
- 不把完整模型响应、模型凭据或未脱敏工具输出推送到浏览器。

## Decisions

### 1. 以现有 Headless API 为页面唯一数据边界

新增 Session 列表和模型探测接口，复用现有 Prompt、Cancel、SSE、Permission、Question 和 Model Config 接口。页面不直接导入 Core；所有状态改变请求通过 Server，所有运行状态通过 API/SSE 合并到页面 store。

备选方案是让 UI 直接创建 Core 端口或调用模型端点。该方案会绕过凭据与权限边界，且会产生第二套 Coding Loop，因此不采用。

### 2. 模型探测使用服务端安全 Probe

服务端使用当前已保存的 ModelPort 发起一次文本请求和一次带最小工具定义的 Function Calling 请求，只返回 `pass`、稳定错误码和请求次数，不返回模型内容。页面将探测作为独立异步操作，不能与保存配置混为一个不可恢复的动作。

### 3. Session 恢复依赖显式列表和 SSE 重连

Session Service 暴露只读列表端口；服务端返回 Session ID、目录和状态。页面持久化当前 Session ID 到 `sessionStorage`，刷新后先拉取详情/列表，再建立 SSE、刷新权限和 Question。重连不会重新提交 Prompt，事件仅按序追加并用 sequence 去重。

### 4. UI 采用单页控制台分区

页面分为模型与探测、Session 控制、Prompt 与运行操作、事件时间线、权限队列、Question 队列、上下文状态七个区域。每个状态改变按钮都绑定独立的 busy 状态；请求失败保留输入和当前展示，重连、刷新和重试都必须是显式操作。

### 5. 默认采用人工审批策略

页面将所有待审批动作可见化，并提供一次允许、始终允许和拒绝。Core 继续负责真正的权限判断，UI 只提交决策；允许始终只由 Broker 在当前进程内记录，不在浏览器持久化权限授权。

## Risks / Trade-offs

- [Risk] Session 仍是进程内数据，服务重启后页面保存的 ID 无法恢复 → 页面在 404 时清理当前 Session 并提示重新创建，不伪造历史状态。
- [Risk] SSE 重连可能收到重复事件 → 页面按 `sessionID + sequence` 去重，保留原有事件顺序。
- [Risk] 模型探测会产生额外请求和费用 → 探测由用户显式点击触发，按钮在请求期间禁用，并在页面显示探测时间和结果。
- [Risk] 模型返回异常工具参数 → 继续使用 Core 的严格解析与 caller-safe 错误，不在 UI 侧执行或修正参数。
- [Risk] 页面长时间运行导致事件列表增长 → POC 阶段限制时间线保留最近 200 条事件，并显示已截断提示。

## Migration Plan

1. 先扩展 Core/Server/Protocol 的只读列表与模型探测契约。
2. 重新生成客户端接口并添加服务端契约测试。
3. 更新页面状态管理与控制区，再补充 Playwright smoke。
4. 失败时可回滚整次变更；旧页面仍可使用已有接口，新增路由不影响既有调用方。
