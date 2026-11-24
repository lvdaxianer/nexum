# UI 交互协议

状态：现状基线

权威来源：`packages/nexum-protocol/src/index.ts`、`packages/nexum-chat-surface/src/index.ts`、`packages/nexum-chat-surface/src/chat-surface.tsx`、`packages/nexum-surfaces/src/main.tsx`

最后核对：2026-11-24

## 1. 交互分类

Nexum UI 交互必须先判断属于哪一类：

| 类型             | 产生者                    | UI 责任                                      | 是否进入 Runtime Protocol |
| ---------------- | ------------------------- | -------------------------------------------- | ------------------------- |
| Runtime 驱动交互 | Core/Application/工具执行 | 展示结构化请求、提交用户决定、同步结果       | 是                        |
| UI 本地交互      | Surface 自身              | 管理打开、选中、输入、确认、提交中和错误状态 | 否                        |

Runtime 驱动交互不能通过解析模型文本猜测；UI 只消费 Protocol 事件、Session state 和明确的 Client 方法。UI 本地交互不能伪装成 Runtime 事件，也不能直接修改 Core 状态。

## 2. Runtime 驱动交互

当前 Runtime 驱动交互包括：

- `Permission`：工具动作需要用户决定 `allow_once`、`allow_always` 或 `deny`；
- `Question`：Agent 需要一个或多个结构化问题的答案，支持单选和多选；
- 流式输出：思考、推理、文本、工具请求、工具结果和上下文压缩；
- 运行控制：发送 Prompt、继续、取消，以及 completed/failed/cancelled 终态。

统一生命周期：

```text
请求产生
  → 事件或 Session state 发现
  → UI 展示 pending
  → 用户 reply / cancel
  → Client 调用 HTTP API
  → Runtime 继续、拒绝或结束
  → 事件更新 UI 投影
```

### 2.1 发现和恢复

`ChatSurface` 初始化 Session 时并行加载历史和 `session state`，随后从 `lastSequence` 之后订阅事件。页面刷新或 SSE 断线后，UI 必须重新读取 state/history 或使用 `afterSequence` 重新订阅，不能只依赖未来事件。

pending Permission/Question 由 state 的 `pendingPermissions` 和 `pendingQuestions` 恢复；事件到达后还要刷新 pending 列表，避免请求事件和初始订阅之间的竞态造成 UI 遗漏。

### 2.2 结构化答案

Question 的回答是与问题顺序一致的二维数组：

```json
{
  "requestID": "question_001",
  "answers": [["选项 A"], ["选项 B", "选项 C"]]
}
```

每个内部数组对应一个问题。`multiple` 未开启时只能提交一个值；有选项约束时，值必须来自服务端返回的 `label`。UI 展示 `description`，但不得自行改写或生成协议值。

### 2.3 权限决定

Permission 展示 `action`、`resource` 和可选 `reason`。用户决定通过 Client 的稳定方法提交，Surface 不直接写策略 Store。`allow_once`、`allow_always` 和 `deny` 的业务语义由 Runtime 解释，UI 只显示处理状态和安全错误。

## 3. UI 本地交互

以下行为属于 Surface 本地状态：

- Session 列表选择和当前 Session 切换；
- 抽屉、Popover、Tab 和确认框的打开/关闭；
- Prompt 输入、`@skill` 建议和本地选中态；
- 删除 Session、取消注册 Skill、保存模型等危险操作确认；
- 加载、表单校验、提交中、成功和错误提示。

本地操作使用以下状态模型：

```text
idle → open → submitting → success
                         ↘ error
```

提交中的操作必须禁用对应按钮并阻止重复提交。危险确认框在 busy 期间禁止 ESC、遮罩或返回关闭；操作成功后关闭并刷新资源，失败后保留上下文和可重试入口。

## 4. UI 展示协议

### 4.1 状态和可访问性

- 正在加载的历史使用 `role="status"`；
- 失败提示使用 `role="alert"` 并提供重试；
- Runtime 请求区使用 `aria-live="assertive"`，事件时间线使用 `aria-live="polite"`；
- Question 选项使用 `aria-pressed` 表达选择状态；
- Tab 使用 `role="tablist"`、`role="tab"` 和 `aria-selected`；
- 发送、取消、继续和重连按钮在不可用时必须有 disabled 状态和明确的处理中文案。

### 4.2 空态和错误

空态必须说明下一步操作，例如等待宿主传入 Session、在已就绪 Session 中输入第一个任务，或说明本轮还没有事件。错误提示不得只显示异常堆栈；应保留 `traceId` 供排障，并告诉用户能否重试、继续或重新连接。

### 4.3 关联 ID 和去重

事件由 `eventID` 去重，事件序列由 `sequence` 递进；工具、Permission、Question 和运行卡片使用对应的 request/tool/run ID 更新，不以展示文本作为主键。

## 5. 相关文档

- [UI 状态与操作可靠性](states.md)
- [Runtime API](../../apis/nexum.md)
