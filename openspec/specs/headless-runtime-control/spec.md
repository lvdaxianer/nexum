# headless-runtime-control Specification

## Purpose
让页面能够安全地控制和观察模型运行时、工具权限、Question 补充信息以及上下文状态，保证所有高风险副作用都经过可见、可恢复的人工决策。

## Requirements

### Requirement: 页面可以检查并保存模型运行时

页面 SHALL 支持保存一个 OpenAI-compatible 模型配置，并提供不泄露凭据的文本响应和 Function Calling 连接检查结果。

#### Scenario: 保存模型配置
- **WHEN** 用户提交合法 Base URL、模型名和凭据
- **THEN** 服务保存配置，响应只返回安全配置视图，页面清空凭据输入并显示已配置状态

#### Scenario: 模型检查通过
- **WHEN** 用户点击连接检查且模型返回文本与工具调用能力
- **THEN** 页面分别显示文本响应和 Function Calling 均通过，不展示凭据或完整模型响应内容

#### Scenario: 模型检查失败
- **WHEN** 模型端点认证失败、不可达或响应格式无效
- **THEN** 页面显示稳定错误原因，保留可重试的模型配置，不自动切换其他 Provider

### Requirement: 页面可以处理所有待决策工具调用

服务 SHALL 将每个待审批工具请求暴露给页面，页面 SHALL 展示动作、资源和安全原因，并提供一次允许、始终允许和拒绝三种明确决策。

#### Scenario: 拒绝副作用工具
- **WHEN** 页面用户拒绝写文件、编辑文件或 Shell 工具请求
- **THEN** 工具不执行，任务进入失败或可恢复的终止状态，页面展示拒绝结果

#### Scenario: 允许工具并继续
- **WHEN** 页面用户允许一个待审批工具
- **THEN** 工具执行一次，页面展示脱敏后的工具结果，Coding Loop 继续请求模型

#### Scenario: 重复回复同一权限请求
- **WHEN** 权限请求已经终结后页面再次提交相同决定
- **THEN** 服务返回幂等结果或稳定的不存在错误，不重复执行工具

### Requirement: 页面可以处理 Question 和运行上下文

页面 SHALL 展示待回答 Question、提交结构化答案或取消 Question，并展示工具调用结果、上下文压缩状态和项目上下文来源。

#### Scenario: 回答 Question
- **WHEN** 用户为每个问题选择合法答案并提交
- **THEN** 页面清除 pending Question，运行继续，并在事件时间线中显示 Question 结果

#### Scenario: 取消 Question
- **WHEN** 用户取消 pending Question
- **THEN** 服务不伪造答案，运行进入失败或取消状态，页面显示取消原因

#### Scenario: 观察上下文状态
- **WHEN** Core 开始、完成或失败一次上下文压缩并加载项目上下文
- **THEN** 页面分别展示状态、摘要统计和来源标识，不展示未脱敏的凭据内容

### Requirement: Runtime exposes typed reasoning events

Nexum Protocol SHALL expose `assistant.thinking`, `assistant.reasoning` and `assistant.text` as stable runtime event types. Reasoning deltas SHALL contain only the model-provided text increment, while event identity and ordering SHALL use the existing event envelope.

#### Scenario: Protocol advertises reasoning events
- **WHEN** a client reads Nexum capabilities
- **THEN** `eventTypes` contains `assistant.thinking`, `assistant.reasoning` and `assistant.text`

#### Scenario: Reasoning delta has a stable public shape
- **WHEN** Core publishes a reasoning increment
- **THEN** the SSE event type is `assistant.reasoning` and its data contains a string `content` field together with the standard event identity fields

### Requirement: Core preserves reasoning order and visibility boundaries

Core SHALL publish model-provided reasoning increments in sequence order before the related tool or final text events, SHALL keep reasoning in canonical model history, and SHALL NOT merge reasoning into `assistant.text` event data.

#### Scenario: Reasoning precedes a tool call
- **WHEN** a model returns reasoning followed by a tool call
- **THEN** the event sequence contains `assistant.reasoning` before `tool.request`, and the reasoning content remains available to the next model step

#### Scenario: Model provides no reasoning
- **WHEN** a model emits text or a tool call without reasoning content
- **THEN** Core emits no fabricated `assistant.reasoning` content and may emit only the safe `assistant.thinking` heartbeat while the model is silent

### Requirement: UI renders reasoning as a continuous transcript

A Nexum UI SHALL be able to reconstruct reasoning, tool activity and final text from ordered runtime events. It SHALL keep reasoning in its own transcript segment, append deltas in real time, and leave completed reasoning visible without representing it as a mandatory large card.

#### Scenario: Reasoning streams between tool actions
- **WHEN** the UI receives reasoning deltas, a tool request/result, and later assistant text
- **THEN** it shows reasoning text, lightweight tool rows, and the final answer in that event order on one scrolling transcript

#### Scenario: Reasoning segment completes
- **WHEN** a later tool or assistant text event arrives
- **THEN** the active reasoning segment stops showing a streaming cursor, remains in the transcript, and does not become part of the final assistant text

#### Scenario: Client reconnects during reasoning
- **WHEN** the UI reconnects and receives replayed reasoning events after its last event ID
- **THEN** it rebuilds the same ordered transcript without duplicating already applied deltas

### Requirement: Runtime status SHALL distinguish model thinking from tool execution

运行时状态 SHALL 区分模型请求、工具执行、工具等待权限、工具超时、工具失败和取消；工具执行期间不得仅显示模型正在思考来代替真实状态。

#### Scenario: Shell is running

- **WHEN** Core 已发出 Shell 工具调用且命令尚未结束
- **THEN** 页面 SHALL 显示工具执行状态、工具名称和可观察的执行时长，而不是只显示模型思考

#### Scenario: Shell times out

- **WHEN** Shell 达到执行截止时间
- **THEN** 页面 SHALL 显示超时原因、停止状态和继续或重试入口

#### Scenario: Shell is cancelled

- **WHEN** 用户取消正在执行的 Shell
- **THEN** 页面 SHALL 显示取消已确认，并允许用户继续当前 Session 或重新提交任务
