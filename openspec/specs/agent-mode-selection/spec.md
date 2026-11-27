# agent-mode-selection Specification

## Purpose

统一 Agent 的 Plan/Build 模式选择、默认值、协议传输和页面可见性。

## Requirements

### Requirement: Agent 实例支持默认模式和单实例覆盖

系统 SHALL 支持在应用 Runtime 实例化时配置默认 Agent 模式，并允许创建单个 Session 时用显式模式覆盖该默认值。

#### Scenario: Runtime 默认创建 Plan Session

- **WHEN** 应用以 `defaultAgentMode: "plan"` 实例化 Runtime 且创建 Session 时未传 mode
- **THEN** 新 Session 的模式为 `plan`

#### Scenario: Session 参数覆盖 Runtime 默认值

- **WHEN** Runtime 默认模式为 `plan` 且创建 Session 时传入 `mode: "build"`
- **THEN** 新 Session 的模式为 `build`

#### Scenario: 未配置模式时保持兼容默认值

- **WHEN** Runtime 和 Session 创建参数都未指定 mode
- **THEN** 新 Session 的模式为 `build`

### Requirement: Protocol SHALL 传输规范化 Agent 模式

Nexum Protocol SHALL 在 Session 创建请求中接受 `plan` 或 `build`，并在创建、列表、状态和模式更新响应中返回当前生效模式。

#### Scenario: 创建请求指定 Plan

- **WHEN** 客户端提交合法工作目录和 `mode: "plan"`
- **THEN** 服务创建 Plan Session，并在响应中返回 `mode: "plan"`

#### Scenario: 创建请求指定非法模式

- **WHEN** 客户端提交不属于 `plan` 或 `build` 的 mode
- **THEN** 服务拒绝请求并返回稳定的参数错误，不创建 Session

#### Scenario: 旧 Session 缺少模式

- **WHEN** 服务读取没有 mode 字段的旧 Session
- **THEN** 对外响应将其规范化为 `mode: "build"`

### Requirement: 页面 SHALL 清晰展示并选择 Agent 模式

页面 SHALL 在当前 Session 和 Session 列表中显示 Plan/Build 状态，并在新建 Session 时提供模式选择；页面展示的模式 SHALL 来自 Protocol 返回值。

#### Scenario: 新建 Session 选择 Plan

- **WHEN** 用户在新建 Session 表单选择 Plan 并提交
- **THEN** 页面以 Plan 模式选中该 Session，并在列表和当前会话区域显示 Plan

#### Scenario: 切换模式后增量更新

- **WHEN** 用户对空闲 Session 切换模式成功
- **THEN** 页面只更新该 Session 的模式展示，不重建或清空其他 Session 和聊天内容

#### Scenario: 模式请求失败

- **WHEN** 模式创建或切换请求失败
- **THEN** 页面保留原模式、停止忙碌状态并显示可恢复的错误提示
