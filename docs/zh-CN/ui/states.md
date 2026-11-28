# UI 状态与操作可靠性

[English](../../ui/states.md)

状态：现状基线

权威来源：`packages/nexum-chat-surface/src/chat-surface.tsx`、`packages/nexum-test/src/main.tsx`、`packages/nexum-test/src/confirm-dialog.tsx`

最后核对：2026-11-24

## 1. ChatSurface 状态

ChatSurface 将 Runtime 和本地连接状态投影为以下可见状态：

| 状态                    | 进入条件                    | UI 行为                                      | 可用操作                 |
| ----------------------- | --------------------------- | -------------------------------------------- | ------------------------ |
| `no session`            | 宿主没有传入 Session ID     | 显示等待 Session 的空态，禁用输入            | 无                       |
| `idle`                  | Session 已加载且没有运行    | 显示历史或就绪空态                           | 输入、发送、重连         |
| `running` / `streaming` | Prompt 已提交或收到运行事件 | 显示流式文本/思考/工具状态，锁定 Prompt 输入 | 取消                     |
| `retrying`              | 收到模型重试事件            | 显示重试状态，锁定输入                       | 等待或取消               |
| `awaiting permission`   | 收到 `permission.requested` | 显示权限卡片，保留请求上下文                 | 允许一次、始终允许、拒绝 |
| `awaiting question`     | 收到 `question.request`     | 显示反问卡片和选项                           | 选择、提交、取消         |
| `completed`             | Session 或 Run 正常完成     | 显示完成状态，停止继续提示                   | 新 Prompt                |
| `failed`                | 发送、模型或 Runtime 失败   | 显示安全错误；可继续时提供继续按钮           | 重试、继续或重新连接     |
| `cancelled`             | 用户取消或收到取消终态      | 显示取消结果，结束本轮取消态                 | 新 Prompt                |

`session.status` 的协议值是 `idle`、`running`、`completed`、`failed`、`cancelled`；Surface 可以使用更细的展示状态，但不能把展示状态写回协议。

## 2. 初始化、切换和恢复

1. Session ID 变化时，先中止旧事件流并清空本地投影。
2. 并行加载 Session state 和一页 canonical history。
3. state 先恢复 Session 状态、可继续标记、pending Permission/Question。
4. history 恢复用户、assistant、reasoning、tool 和 system 消息。
5. 从 `lastSequence` 之后订阅 SSE；事件 ID 重复或 sequence 不递进时丢弃。
6. 历史加载失败时保留错误和重试按钮，不把失败误显示为空历史。

Session 切换后，旧请求返回不能覆盖新 Session；组件使用生命周期标识和当前 Session ID 判断异步结果是否仍然有效。

## 3. 历史分页和连接状态

向上滚动接近顶部时加载更早历史，并使用 `snapshotID` 防止历史被压缩或重写后拼接错误。历史请求期间保持 `historyLoading`，失败时显示错误；快照过期时丢弃旧分页游标并回到最新快照。

事件流连接状态显示在线/离线。断线时保留已有聊天内容和事件，不清空页面；用户可以重连，重连使用已知的 sequence 继续读取。连接错误应显示可理解的通知和 trace 信息，不显示内部堆栈。

## 4. 提交、取消和继续

### Prompt

- 空文本、无 Session、已有提交或运行锁定时不发送；
- 发送后立即显示用户消息和思考占位，按钮进入发送中；
- Server 成功接纳后等待事件，清空输入；
- Server 失败时移除思考占位，显示失败项和可重试通知。

### Question / Permission

- 同一请求在处理期间只允许一个提交动作；
- 成功后移除 pending 卡片并等待 Runtime 后续事件；
- 失败保留卡片和选择，允许用户重新提交；
- Question 取消显示已取消，Permission 拒绝显示失败/拒绝，不假装运行成功。

### Cancel / Continue

- 取消动作在请求期间显示处理中，完成后进入 cancelled；
- 取消失败清除 busy 状态但保留当前运行提示；
- 只有 `canContinue` 或 `run.settled` 的 failed 结果允许继续；
- 继续期间禁用继续按钮，失败回到 failed 并保留重试入口。

## 5. 参考 Surface 的本地状态

内部 Test Workbench 使用 `idle`、`pending`、`success`、`error` 等本地 ActionState 管理模型保存、Session 创建/删除、Skill 注册、Role Prompt 和策略变更。网络操作期间按钮禁用，失败信息留在当前抽屉或确认框内；成功后刷新对应资源。

危险操作的 ConfirmDialog 在 `busy` 时：

- 确认和返回按钮均 disabled；
- 遮罩、ESC 和外部关闭不会关闭对话框；
- 确认按钮显示“处理中…”；
- 操作完成后由宿主关闭并刷新列表。

## 6. 相关文档

- [UI 交互协议](interaction-protocol.md)
- [Runtime 运行流程](../architecture/runtime-flow.md)
