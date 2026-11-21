# Headless Session 可继续运行与回复状态设计

## 背景

当前 Headless 工作台在一个 Session 完成第一次 Prompt 后再次提交任务时，后端拒绝
`completed -> running` 状态迁移，但 Prompt 接口仍返回 `accepted`。前端随后把状态
乐观设置为 `running`，由于没有任何运行事件可消费，页面会永久显示“回复中”。

同时，模型尚未返回首段文本时，主对话区域只有空白，用户无法判断 Agent 是正在思考、
等待模型，还是已经失去响应。

## 目标

1. 已完成、失败或取消的 Session 可以继续提交新的 Prompt。
2. 同一个 Session 同时只能有一轮运行，重复提交得到明确的冲突响应。
3. Prompt 提交成功后，回答区域立即出现“正在思考”动态占位。
4. 首个 `assistant.text` 事件到达后，思考占位替换为流式回答。
5. 完成、失败、取消和断线都能落到可识别、可恢复的终态。
6. 不改变工作目录、模型配置和现有权限流的语义。

## 非目标

- 本次不引入完整的持久化对话消息历史。
- 本次不改造模型供应商协议或增加新的模型能力。
- 本次不把事件 Hub 改造成跨进程持久化事件存储。
- 本次不重做工作台整体布局，只调整运行反馈区域和状态切换。

## 方案

### Session 状态与 Prompt admission

Session 的 `completed`、`failed`、`cancelled` 表示上一轮运行的结果，不再表示
Session 永久终止。允许显式的新 Prompt 将这些状态重新置为 `running`；`idle` 仍可
启动第一轮运行。

后端 Prompt 入口在接收请求时拒绝已经 `running` 的 Session，返回稳定的冲突错误，
防止重复请求覆盖本地 `activeRuns`。非运行状态的 Prompt 仍异步返回 `accepted`，
运行过程的失败通过 `session.failed` 事件和持久化状态暴露。

Coding Loop 将运行启动纳入统一异常路径，并确保活动运行在结束、失败或取消后清理。
这样状态迁移失败不能再被静默吞掉而留下假运行状态。

### 前端运行反馈

发送 Prompt 成功后，聊天流追加一个 Assistant 思考卡片：头像、`正在思考` 文案和
三个逐个跳动的点。这个卡片位于用户消息之后、回答区域内，不挤占右侧运行监控。

状态切换如下：

```text
Prompt accepted
  -> Assistant thinking card + 输入锁定 + 可取消
  -> assistant.text: 替换 thinking card，追加流式文本和光标
  -> session.completed: 去掉光标，显示已完成，可继续输入
  -> session.failed: 显示失败原因和重试入口，解除输入锁定
  -> session.cancelled: 显示已取消，解除输入锁定
```

动画遵守 `prefers-reduced-motion`：减少动效时保留静态“正在思考”状态，不隐藏语义。
失败和完成结果同时保留在对话流中，不只依赖短暂通知。

页面恢复 Session 时根据服务器快照恢复运行状态；若快照为 `running` 且尚无文本事件，
显示思考卡片，避免刷新后回到空白区域。

## 错误与恢复

- Prompt 请求遇到运行冲突：保留用户输入，显示“当前 Session 正在运行”，不追加思考卡片。
- Prompt 请求网络失败：解除发送按钮忙状态，保留输入内容，并提供重新发送路径。
- 模型或工具失败：由 `session.failed` 驱动失败卡片，保留失败原因和原 Prompt。
- 用户取消：由 `session.cancelled` 驱动取消卡片，输入恢复可用。
- SSE 断开：保留当前聊天内容，显示断线提示，并允许重新连接或刷新状态。

## 验证

- Core Session 测试覆盖终态重新进入 `running` 和运行中的重复启动保护。
- Server 测试覆盖已完成 Session 再次 Prompt、运行冲突错误和事件终态。
- UI Smoke 测试覆盖思考卡片、首段文本替换、完成后再次输入、失败恢复和 reduced-motion
  下的可读状态。
- 运行 headless-ui 类型检查、构建、相关 Core/Server 测试和完整 `bun run check`。
- 部署后通过真实服务器执行一次二次 Prompt，确认 API 状态、SSE 事件和浏览器呈现一致。

## 兼容与回滚

变更只扩展已有 Session 状态迁移和前端状态展示，不改变现有 API 路径。若部署后出现
运行异常，可回滚到上一版本；已有 Session 数据仍使用现有 JSON 格式，无迁移步骤。
