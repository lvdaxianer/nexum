# Spec Delta

## Purpose

让任意 Headless UI 都能驱动与 OpenCode 兼容的工具调用循环，并可靠地处理多工具响应、工具结果回传和模型继续生成。

## ADDED Requirements

### Requirement: 模型工具调用必须经过统一执行边界

Headless Runtime MUST 将模型返回的每个函数调用转换为带有稳定调用 ID、工具名称和结构化参数的工具请求，并在执行前经过权限边界。

#### Scenario: 单个函数调用

- **WHEN** 模型返回一个合法的函数调用
- **THEN** Runtime 发布一个包含调用 ID、工具名称和参数的 `tool.request` 事件，并只在权限允许后执行工具

#### Scenario: 同一响应包含多个函数调用

- **WHEN** 模型在一个 assistant 响应中返回多个合法函数调用
- **THEN** Runtime 按返回顺序逐个发布请求、执行工具并发布对应结果，不丢弃任何调用

### Requirement: 工具结果必须形成可继续生成的消息历史

Headless Runtime MUST 将原始用户消息、assistant 工具调用消息和每个 tool result 按调用 ID 组成下一次模型请求。

#### Scenario: 工具执行后继续生成

- **WHEN** 所有工具调用均成功完成
- **THEN** 下一次模型请求包含完整的 assistant `tool_calls` 和对应 `tool_call_id` 的 tool 消息，模型可以返回最终文本

### Requirement: 非法函数调用必须安全失败

Headless Runtime MUST 将缺少调用 ID、工具名称或合法对象参数的模型响应转换为安全错误，不得执行未知工具。

#### Scenario: 工具参数不是对象

- **WHEN** 模型返回无法解析为对象的函数参数
- **THEN** Runtime 发布失败事件并结束 Session，且工具执行次数为零
