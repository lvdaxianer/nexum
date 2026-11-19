# Spec Delta

## Purpose

让模型在信息不足时通过 Headless API 向用户提出结构化问题，并把用户的选择或自由文本答案可靠地回传到后续模型步骤。

## ADDED Requirements

### Requirement: 模型可以创建结构化补充问题

Runtime MUST 识别模型发起的 question 调用，生成带有稳定 ID、问题文本、选项和是否多选信息的 pending question，并暂停当前模型步骤。

#### Scenario: 单选问题进入 pending

- **WHEN** 模型返回一个 question 调用
- **THEN** Runtime 发布 `question.request` 事件，UI 可以通过 Session API 查询该问题，且不会继续执行后续模型步骤

#### Scenario: 多问题保持顺序

- **WHEN** 模型返回包含多个问题的 question 调用
- **THEN** Runtime 按原始顺序展示问题并为每个问题保留对应答案位置

### Requirement: 用户答案必须作为工具结果回传

Runtime MUST 接受 UI 的结构化回答，将答案转换为模型可读的 tool result，并在下一次模型请求中保留问题调用 ID 和答案顺序。

#### Scenario: 用户回答后模型继续

- **WHEN** UI 提交所有问题的回答
- **THEN** Runtime 发布 `question.result`，模型收到包含问题和答案的 tool 消息，并可以继续调用工具或返回最终文本

### Requirement: 问题取消必须安全结束当前交互

用户取消或关闭问题时，Runtime MUST 清理 pending 状态，不得伪造答案，也不得执行依赖未确认信息的后续工具。

#### Scenario: 用户取消问题

- **WHEN** UI 取消 pending question
- **THEN** Runtime 发布明确的取消或失败事件，工具执行次数为零，且同一个问题 ID 不可重复回答
