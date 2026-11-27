# Question 反问协议

[English](../../ui/question.md)

状态：现状基线

权威来源：`packages/nexum-protocol/src/index.ts`、`packages/nexum-core/src/context.ts`、`packages/nexum-application/src/context.ts`、`packages/nexum-server/src/index.ts`、`packages/nexum-chat-surface/src/chat-surface.tsx`

最后核对：2026-11-24

## 1. 用途和边界

Question 是 Agent 在继续工具或模型流程前向用户请求结构化信息的 Runtime 交互。它不是普通文本消息，也不是 UI 自己生成的表单；请求由 Core/Application 产生，Server 暴露查询、回答和取消，Surface 负责展示。

Question 请求的公开结构：

| 字段                   | 类型          | 说明                                  |
| ---------------------- | ------------- | ------------------------------------- |
| `id`                   | string        | 请求 ID，回复和取消时使用             |
| `sessionID`            | string        | 所属 Session，服务端校验归属          |
| `toolCallID`           | string        | 产生 Question 的工具调用 ID           |
| `questions`            | array         | 按顺序排列的一个或多个问题            |
| `questions[].header`   | string        | 问题短标题                            |
| `questions[].question` | string        | 展示给用户的问题文本                  |
| `questions[].options`  | array         | 可选项，包含 `label` 和 `description` |
| `questions[].multiple` | boolean，可选 | 是否允许多个答案                      |

## 2. 发现流程

1. Application 的 Question Port 调用 `ask`，请求进入 pending 并阻塞当前工具结果等待回答。
2. Runtime 发出 `question.request` 事件；事件数据包含 request ID 和结构化问题。
3. UI 通过 SSE 或 `GET /api/nexum/session/{sessionID}/state` 的 `pendingQuestions` 发现请求。
4. UI 也可以调用 `GET /api/nexum/session/{sessionID}/question` 重新读取 pending 请求。
5. 页面刷新时，先加载 state/history，再订阅 `lastSequence` 之后的事件。

Question 是否存在必须由 request ID 和 Session ID 判断，UI 不应根据问题文本去重。

## 3. UI 选择和提交

ChatSurface 为每个 Question 保存一个二维答案数组，数组位置与 `questions` 顺序一致：

```json
{
  "answers": [["src"], ["TypeScript", "Bun"]]
}
```

- 单选问题点击新选项时替换该问题的答案数组；
- 多选问题点击已选项时取消选择，点击未选项时追加；
- UI 使用服务端返回的 `label` 作为提交值，使用 `description` 作为说明；
- 提交时应为每个问题提供一个内部数组，即使该数组为空；
- 提交中禁用同一 Question 的重复提交；
- 成功后移除 pending 卡片，等待 `question.result` 和后续运行事件；
- 失败时保留已选答案和错误提示，允许修正后重试；
- 取消不是伪造答案，必须调用 cancel 端点并展示已取消状态。

## 4. HTTP API

### 4.1 查询 pending Question

```http
GET /api/nexum/session/{sessionID}/question
```

成功响应的 `data` 是 Question 请求数组，使用 Protocol 中的结构。请求不使用 body、query 参数、Cookie 或认证 Header（当前 Server 未实现认证校验）；JSON 响应包含统一 `meta.protocolVersion` 和 `meta.traceId`。

### 4.2 提交回答

```http
POST /api/nexum/session/{sessionID}/question/{requestID}/reply
Content-Type: application/json

{"answers":[["src"]]}
```

成功响应：

```json
{
  "data": { "status": "answered" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_question_001" }
}
```

服务端先验证 `answers` 是二维字符串数组，再由 Question Port 校验问题数量、单选约束和选项 label。常见错误：

| HTTP  | `errorCode`                                            | 条件                                           | UI 处理                          |
| ----- | ------------------------------------------------------ | ---------------------------------------------- | -------------------------------- |
| `400` | `NEXUM_INVALID_REQUEST`                                | body 不是二维字符串数组，或答案数量/选项不合法 | 保留卡片，修正后重试             |
| `404` | `NEXUM_SESSION_NOT_FOUND` / `NEXUM_QUESTION_NOT_FOUND` | Session 或请求不存在                           | 刷新 state，停止使用旧请求       |
| `409` | `NEXUM_QUESTION_SESSION_MISMATCH`                      | 请求不属于当前 Session                         | 丢弃该请求并刷新当前 Session     |
| `409` | `NEXUM_QUESTION_CANCELLED`                             | 请求已经取消或得到非成功结果                   | 显示已取消，不重复提交           |
| `500` | `NEXUM_QUESTION_FAILED`                                | Broker 或内部 Store 失败                       | 保留上下文并带 traceId 重试/排障 |
| `503` | `NEXUM_QUESTION_NOT_CONFIGURED`                        | Server 没有配置 Question Port                  | 显示运行时配置错误               |

### 4.3 取消 Question

```http
POST /api/nexum/session/{sessionID}/question/{requestID}/cancel
Content-Type: application/json

{}
```

请求体当前不会读取业务字段；调用方应发送空 JSON 或按 Server 接受的无体请求。成功响应为 `{ "data": { "status": "cancelled" } }`。取消只结束等待，不生成伪造答案；错误沿用查询和回答的 Session、Not Found、Mismatch、配置和内部错误码。

## 5. 事件和持久化

Question 产生时发送 `question.request`；成功回答发送 `question.result`；取消发送 `question.cancelled`。事件序列和 event ID 用于恢复与去重。

配置 Interaction Store 时，pending Question 只保存可展示的请求摘要。进程重启后没有原等待者的记录会标记为 `orphaned` 并从 pending 查询中移除；UI 可以在历史排障数据中看到它，但不能继续回复它。

## 6. 相关文档

- [UI 交互协议](interaction-protocol.md)
- [UI 状态与操作可靠性](states.md)
- [Runtime API](../../../apis/zh-CN/nexum.md)
- [Runtime 运行流程](../architecture/runtime-flow.md)
