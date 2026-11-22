# Spec Delta

## Purpose

为 Nexum 提供一套不依赖外部企业基础设施即可运行的默认适配器，使嵌入式测试、本地服务和参考应用共享同一组 Core 能力，同时保留替换为生产实现的边界。

## ADDED Requirements

### Requirement: Default adapters SHALL provide an embedded profile

Nexum SHALL 提供一个不需要网络服务和外部数据库的嵌入式配置，至少包含内存 Session、消息、交互和事件存储，以及可注入的模型和 Host 能力。

#### Scenario: 创建嵌入式 Runtime
- **WHEN** 宿主使用嵌入式默认配置创建 Runtime
- **THEN** Runtime SHALL 能够创建 Session、执行 Prompt、发布事件并在进程内完成权限或 Question 交互

### Requirement: Default adapters SHALL provide a local profile

Nexum SHALL 提供一个本地服务配置，至少包含文件或 SQLite 持久化、OpenAI-compatible Model、本地工作目录 Host、Skill 文件注册和 HTTP/SSE 绑定。

#### Scenario: 启动本地服务
- **WHEN** 宿主仅提供本地数据目录和模型配置
- **THEN** 服务 SHALL 启动默认 Runtime，并允许客户端恢复 Session、订阅事件和提交 Prompt

### Requirement: Default adapters SHALL isolate host capabilities

本地文件系统、Shell、进程和网络访问 SHALL 通过 Host Adapter 提供，并在执行前保留工作目录、权限和取消边界。

#### Scenario: 工具访问工作目录外资源
- **WHEN** 默认工具请求访问 Session 工作目录之外的资源
- **THEN** Host Adapter SHALL 拒绝执行并返回稳定的边界错误

### Requirement: Default adapters SHALL preserve replacement contracts

默认适配器 SHALL 通过 Core 端口接入，替换默认存储、模型、Host、Memory 或 MCP 实现时不得要求修改 Agent Loop 或协议数据模型。

#### Scenario: 替换模型适配器
- **WHEN** 宿主将 OpenAI-compatible Model 替换为自定义 ModelPort
- **THEN** 相同的 Session、Tool、Permission 和事件协议 SHALL 继续工作

### Requirement: Optional integrations SHALL not be mandatory dependencies

MCP、向量记忆、企业认证和沙箱等可选集成 SHALL 以可选适配器提供，未安装时默认 Runtime SHALL 仍可启动并在能力发现中标记为不可用或未启用。

#### Scenario: 未安装 MCP 适配器
- **WHEN** 宿主未配置 MCP Adapter
- **THEN** Runtime SHALL 正常启动，能力清单 SHALL 明确 MCP 未启用，且其他 Tool 不得因此失效
