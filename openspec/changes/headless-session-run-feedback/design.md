# Design

## Context

详见 `proposal.md`。当前实现由 `headless-core` 持有 Session 状态迁移和 Coding Loop，
`headless-server` 负责 Prompt admission 与 SSE，`headless-ui` 负责事件投影和聊天状态。
Session 元数据使用 JSON 文件保存，事件 Hub 仍是进程内历史；本次不改变这两个持久化边界。

## Goals / Non-Goals

**Goals:**

- 让一次 Session 承载多轮独立 Prompt，且同一时间只有一个活动运行。
- 让运行失败不会被静默吞掉，也不会让前端停留在虚假的 running 状态。
- 在回答卡片中提供思考动画，并按事件切换到流式输出和终态。
- 让刷新和断线恢复至少能依据服务器快照显示正确的运行中/非运行中状态。

**Non-Goals:**

- 不新增完整的历史消息存储或跨进程事件持久化。
- 不修改模型服务地址、凭据解析、工具权限或工作目录校验。
- 不引入新的运行时依赖。

## Decisions

### 1. 允许终态 Session 重新进入 running

将 `completed`、`failed`、`cancelled` 到 `running` 视为用户显式新 Prompt 触发的合法迁移。
选择扩展现有状态机，而不是增加新的 Session 类型，因为用户可见对象仍是同一个工作目录和
Session ID，且当前 POC 没有独立的 Run 资源。

同时在 Prompt HTTP 入口拒绝已经 `running` 的 Session，返回 409 冲突。仅依赖前端禁用不能
防止重复请求，服务端必须保留并发边界。

### 2. 保持异步 Prompt 接口，但补齐启动失败边界

Prompt 接口继续快速返回 `accepted`，运行结果通过 SSE 事件反馈。Coding Loop 的运行启动
和状态迁移纳入统一异常路径，活动运行在 finally 中清理；对于入口可判定的运行冲突，在返回
`accepted` 前直接返回冲突错误。

这样兼容现有客户端的异步模型，同时避免本次故障中“接口 accepted、任务未启动”的假状态。

### 3. 前端用临时 Assistant 卡片表达思考

发送成功后追加一个带 `thinking` 标记的 Assistant ChatItem。收到首个 `assistant.text` 时
移除该临时项并创建真实的流式回答项；完成、失败和取消事件更新同一个运行卡片或追加终态卡片。
选择 ChatItem 投影而不是单独操纵 DOM，可继续复用现有滚动、事件流和 Markdown 渲染逻辑。

动画只使用 CSS 点位移和透明度变化，并通过 `prefers-reduced-motion` 降级为静态状态。

### 4. 失败恢复以对话内状态为主

失败信息保留在对话流中，通知只作为辅助提示。Prompt 输入在失败或取消后恢复可用并保留
未发送文本；重试操作复用同一条 Prompt admission 路径，避免复制另一套运行逻辑。

## Risks / Trade-offs

- [Risk] 事件 Hub 仍是进程内，服务重启后无法恢复历史事件。→ 使用 Session 快照恢复运行态，
  本次不宣称恢复历史回答；后续可独立增加持久化事件流。
- [Risk] 终态重新运行仍使用当前最小 Prompt 消息，不提供完整历史上下文。→ 保持 POC 现有
  语义，完整对话历史另立需求。
- [Risk] 模型响应较慢时思考动画可能持续较久。→ 保留取消入口、运行状态和失败恢复，避免
  仅依赖视觉动画制造无限等待。

## Migration Plan

1. 在独立 worktree 先运行 Core/Server 回归测试和 UI Smoke 测试。
2. 构建前端并部署为新的不可变 release，后端和前端一起更新以保持状态契约一致。
3. 使用现有 Session 执行一次二次 Prompt，验证 409 并发保护、SSE 终态和浏览器动画。
4. 若健康检查或真实运行失败，将 `current` 回滚到上一已验证 release。
