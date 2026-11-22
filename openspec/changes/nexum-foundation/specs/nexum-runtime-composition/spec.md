# Spec Delta

## Purpose

为 Nexum 提供一个与具体传输和存储实现无关的 Runtime 组合能力，使宿主能够按项目需求注册基础能力，并以一致的生命周期启动、停止和观察 Agent 运行时。

## ADDED Requirements

### Requirement: Runtime SHALL expose explicit capability registration

Runtime SHALL allow the宿主为 Model、Tool、Permission、Interaction、Session、Context、Skill、Memory、MCP 和 Event 等能力提供实现，并在启动前校验必需依赖。

#### Scenario: 启动完整 Runtime
- **WHEN** 宿主提供模型、工具、权限、Session、事件和必要的交互实现
- **THEN** Runtime SHALL 成功启动并返回可执行 Prompt 的实例

#### Scenario: 缺少必需能力
- **WHEN** 宿主未提供模型或工具执行能力
- **THEN** Runtime SHALL 在启动阶段返回稳定的配置错误，不得在首次 Prompt 后才失败

### Requirement: Runtime SHALL keep capability implementations replaceable

Runtime SHALL 通过稳定的能力契约调用实现，不得要求宿主使用指定的存储、模型、传输或 UI 实现。

#### Scenario: 替换 Session 存储
- **WHEN** 宿主将默认 SessionStore 替换为自定义实现
- **THEN** 同一个 Agent Loop 和协议绑定仍 SHALL 正常工作

### Requirement: Runtime SHALL expose capability discovery

Runtime SHALL 提供当前已启用能力及其版本、状态和可用操作的机器可读清单。

#### Scenario: 查询默认能力
- **WHEN** 宿主查询刚启动的默认 Runtime
- **THEN** 返回结果 SHALL 包含已启用的 Model、Tool、Skill、Memory、MCP、Session 和 Event 能力

### Requirement: Runtime SHALL manage lifecycle boundaries

Runtime SHALL 为能力提供统一的启动、就绪和关闭生命周期；关闭 Runtime 后，新的 Prompt 和工具执行 SHALL 被拒绝，已订阅的事件流 SHALL 收到终态或关闭信号。

#### Scenario: 关闭后提交 Prompt
- **WHEN** 宿主关闭 Runtime 后提交新的 Prompt
- **THEN** Runtime SHALL 返回稳定的 Runtime 已关闭错误，且不得执行模型或工具
