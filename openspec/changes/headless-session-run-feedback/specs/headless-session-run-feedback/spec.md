# Spec Delta

## Purpose

为 Headless 工作台提供可恢复的 Session 运行语义和清晰的 Agent 运行反馈，确保用户能够
在同一工作目录继续提交任务，并能区分等待、输出、完成、失败和取消等状态。

## ADDED Requirements

### Requirement: Session 可启动后续运行

系统 SHALL 将已完成、失败或取消的 Session 视为可再次提交 Prompt 的工作上下文，而不是永久终止的对象。

#### Scenario: 完成的 Session 再次提交 Prompt

- **WHEN** 用户对状态为 `completed` 的 Session 提交非空 Prompt
- **THEN** 系统接受该 Prompt，将本轮状态设为 `running`，并开始新的运行事件流

#### Scenario: 失败的 Session 再次提交 Prompt

- **WHEN** 用户对状态为 `failed` 的 Session 提交非空 Prompt
- **THEN** 系统接受该 Prompt，将本轮状态设为 `running`，并开始新的运行事件流

#### Scenario: 取消的 Session 再次提交 Prompt

- **WHEN** 用户对状态为 `cancelled` 的 Session 提交非空 Prompt
- **THEN** 系统接受该 Prompt，将本轮状态设为 `running`，并开始新的运行事件流

### Requirement: Session 运行并发保护

系统 SHALL 保证同一 Session 同时最多存在一轮运行；运行中的 Session 再次提交 Prompt MUST 返回稳定的冲突错误，且不得覆盖或替换当前运行。

#### Scenario: 运行中重复提交

- **WHEN** 用户对状态为 `running` 的 Session 再次提交 Prompt
- **THEN** 接口返回 HTTP 409、机器可识别的冲突错误码和明确的中文提示，且 Session 仍保持原运行

### Requirement: 运行反馈状态可观察

系统 SHALL 为一次 Prompt 运行提供可区分的思考中、流式回答、完成、失败和取消状态，并将终态保留在当前对话视图中。

#### Scenario: 模型尚未返回文本

- **WHEN** Prompt 已被接受但尚未收到首个 `assistant.text` 事件
- **THEN** 对话区域显示带动态点的“正在思考”状态，输入控件保持禁用，并提供取消当前运行的入口

#### Scenario: 收到首段文本

- **WHEN** 客户端收到首个 `assistant.text` 事件
- **THEN** “正在思考”状态替换为 Assistant 回答卡片，并继续追加后续文本增量

#### Scenario: 运行完成

- **WHEN** 客户端收到 `session.completed` 事件
- **THEN** 回答卡片停止动态效果，显示已完成状态，输入控件恢复可用

#### Scenario: 运行失败

- **WHEN** 客户端收到 `session.failed` 事件或 Prompt 请求明确失败
- **THEN** 对话区域保留失败信息和原 Prompt，输入控件恢复可用，并提供重新发送或重试路径

#### Scenario: 运行取消

- **WHEN** 客户端收到 `session.cancelled` 事件
- **THEN** 对话区域显示已取消状态，输入控件恢复可用

### Requirement: 刷新后恢复运行反馈

系统 SHALL 根据服务器 Session 快照恢复运行状态；运行中但没有可恢复文本事件时，客户端 MUST 显示思考状态而不是空白对话区域。

#### Scenario: 刷新运行中的 Session

- **WHEN** 页面加载并选中服务器状态为 `running` 的 Session，且当前没有文本事件
- **THEN** 页面显示“正在思考”状态并保持取消入口可用

#### Scenario: 刷新已完成的 Session

- **WHEN** 页面加载并选中服务器状态为 `completed`、`failed` 或 `cancelled` 的 Session
- **THEN** 页面不显示运行中动画，输入控件可用

