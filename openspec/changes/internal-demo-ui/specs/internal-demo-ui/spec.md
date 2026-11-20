# Spec Delta

## Purpose

为内部团队提供一个中文优先、状态清晰、可直接演示 Headless Core 能力的工作台，让演示者能够在同一页面完成 Session 运行并处理运行时介入。

## ADDED Requirements

### Requirement: 工作台 SHALL 提供清晰的核心运行路径

页面 MUST 让用户从项目/Session 选择进入 Prompt 工作区，并在同一视图中查看模型输出、工具调用和运行事件；模型配置、Session 管理和运行控制必须有明确的区域层级。

#### Scenario: 首次打开工作台

- **WHEN** 用户打开内部演示 UI 且尚未选择 Session
- **THEN** 页面显示当前 API 连接状态、模型配置入口、工作目录入口和创建 Session 的下一步操作

#### Scenario: 运行中的 Session

- **WHEN** 用户选择或创建一个 Session
- **THEN** 页面显示当前 Session 标识、运行状态、Prompt 输入区和按时间排序的事件时间线

### Requirement: 工作台 SHALL 展示 Core 能力状态

页面 MUST 将 Function Calling、Permission、Question、Context Compaction 和 Skill 状态作为可识别的能力卡片或状态区域展示，并使用文本状态而非仅依赖颜色表达状态。

#### Scenario: Core 能力处于空闲状态

- **WHEN** 当前 Session 没有待处理请求或运行事件
- **THEN** 各能力区域显示可理解的空状态和下一步提示，而不是空白或无意义的占位符

#### Scenario: 收到运行时事件

- **WHEN** SSE 收到工具调用、Question、权限、上下文压缩或 Skill 事件
- **THEN** 对应能力状态区域更新，并保留事件时间线中的可追溯记录

### Requirement: 工作台 MUST 支持显式处理运行时介入

页面 MUST 将权限请求和 Question 请求形成待处理队列；用户提交决策或答案前不得伪造完成状态，处理期间必须阻止重复提交。

#### Scenario: 处理权限请求

- **WHEN** Core 发出权限请求
- **THEN** 页面显示资源、动作和影响范围，并提供允许一次、始终允许和拒绝操作；点击后按钮进入忙碌状态直到服务端返回结果

#### Scenario: 处理补充问题

- **WHEN** Core 发出 Question 请求
- **THEN** 页面展示问题和选项，用户提交后才继续运行；用户取消时页面明确显示已取消且不生成虚假答案

### Requirement: 工作台 SHALL 提供可靠的状态反馈与恢复

页面 MUST 为模型保存、探测、Session 创建、Prompt 提交、权限决策、Question 回复和事件流重连显示 loading、成功、失败或取消状态；失败时必须保留用户输入并提供可执行的恢复动作。

#### Scenario: 重复触发状态变更

- **WHEN** 用户在请求尚未完成时重复点击同一操作
- **THEN** 页面只保留一个进行中的请求并阻止重复触发

#### Scenario: 事件流断开

- **WHEN** Session 事件流断开或 API 暂时不可用
- **THEN** 页面显示断开状态，保留已有事件和输入内容，并提供重新连接或重试操作

### Requirement: 工作台 SHALL 适配常见屏幕和辅助操作

页面 MUST 在桌面和窄屏宽度下保持核心路径可用，交互控件必须有可见焦点、可读名称和键盘操作路径。

#### Scenario: 窄屏浏览

- **WHEN** 视口宽度不足以并排展示三列
- **THEN** 导航、主工作区和状态区域按稳定顺序堆叠或折叠，不能发生横向溢出或遮挡输入区

#### Scenario: 键盘操作

- **WHEN** 用户仅使用键盘浏览和提交表单
- **THEN** Tab 顺序符合视觉顺序，当前焦点可见，主要按钮和输入区可操作
