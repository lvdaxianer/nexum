# Spec Delta

## Purpose

让页面能够安全地控制和观察模型运行时、工具权限、Question 补充信息以及上下文状态，保证所有高风险副作用都经过可见、可恢复的人工决策。

## ADDED Requirements

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
