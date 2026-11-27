# Nexum Runtime 运行流程

[English](../../architecture/runtime-flow.md)

状态：现状基线

权威来源：`packages/nexum-application`、`packages/nexum-core`、`packages/nexum-server`、`packages/nexum-client` 和 `packages/nexum-protocol`

最后核对：2026-11-24

## 总体链路

```text
用户操作
  ↓
Surface / ChatSurface
  ↓ @nexum/client
HTTP JSON / SSE
  ↓ @nexum/server
Application Runtime Composer
  ↓
Core Session + Coding Loop
  ↓ ports
Model / Host / Store / Event / Interaction
```

Surface 负责把协议状态投影为页面、聊天卡片、抽屉和本地确认；Client 负责协议消费；Server 负责把已组合的 Runtime 绑定到 HTTP/SSE；Application 负责把 Core、Persistence 和 Integrations 组合；Core 负责跨宿主仍然成立的运行语义。

## Prompt 到终态

```text
提交 Prompt
  → Server 校验并交给 Session/Application
  → Core 推进一次模型调用
  → 产生文本、推理、工具、权限或 Question 事实
  → Protocol 编码为事件和状态
  → Server 通过 SSE 投递
  → Surface 按 eventID/关联 ID 更新可读投影
  → 继续运行、等待用户交互或进入终态
```

一个运行过程可以包含多次模型步骤，但每一步的模型可见记录和事件必须使用 Protocol 定义的类型。终态通过明确的 completed、failed 或 cancelled 语义表达，Surface 不得根据最后一段文本猜测终态。

## 交互暂停

当 Core/Application 产生 Permission 或 Question 时：

1. 交互请求使用稳定的 request ID、Session ID 和必要的结构化数据落入 Interaction Store（如果配置了持久化）。
2. Protocol 发送 `permission.requested` 或 `question.request` 事件。
3. Surface 通过 SSE 或 Session state 发现 pending 请求并展示对应卡片。
4. 用户提交 reply 或 cancel；Client 调用对应 HTTP 端点。
5. Application Broker 校验 Session、请求 ID、答案/策略，并将结果交回等待中的 Runtime。
6. Protocol 发送 result/cancelled 或后续运行事件，Surface 更新卡片和时间线。

服务重启后，持久化的 pending 交互没有原进程等待者，会被标记为 orphaned；历史可以被查看，但不应被 UI 当作可继续执行的请求。

## 事件与恢复

SSE 事件带有 `eventID`、`runID`、`sessionID`、`sequence` 和 `occurredAt`。Client/Surface 使用 event ID 去重，使用关联的 request/tool ID 更新已有卡片，并在断线后结合 Session state 或 canonical history 恢复页面，而不是假设 SSE 从未中断。

消息历史和事件流是不同的读取模型：历史用于恢复可见对话，事件用于观察运行过程。默认角色 Prompt、Skill 原文、工具定义和凭据不应被当作普通对话历史返回。

## 取消与失败

- 用户取消通过显式的 Session cancel 操作进入 Runtime；Surface 只展示请求中的取消状态和最终结果。
- 模型错误、工具错误、权限拒绝、Question 取消和上下文压缩失败必须通过稳定事件或错误响应表达。
- Server 负责把内部失败映射为安全的错误响应，不把堆栈、内部路径或凭据返回给 Client。
- 运行结束后，Surface 以 `session.completed`、`session.failed`、`session.cancelled` 或 `run.settled` 等协议事实更新状态。

Question、Permission 和状态细节见后续 UI/能力文档；HTTP/SSE 请求契约见 [`apis/nexum.md`](../../../apis/zh-CN/nexum.md)。
