# Spec Delta

## ADDED Requirements

### Requirement: 宿主聊天页面 SHALL 显示当前 Agent 模式

承载 ChatSurface 的宿主页面 SHALL 在当前 Session 标题或紧邻 Composer 的控制区显示当前 Agent 模式，并使用与权限策略不同的语义标签。

#### Scenario: 当前 Session 为 Plan

- **WHEN** 宿主页面加载 `mode: "plan"` 的 Session
- **THEN** 页面在 Session 标题区域或 Composer 控制区显示 Plan 标签

#### Scenario: 当前 Session 为 Build

- **WHEN** 宿主页面加载 `mode: "build"` 的 Session
- **THEN** 页面显示 Build 标签，且不把权限策略标签当作模式提示

### Requirement: 模式切换 SHALL 提供可靠反馈

模式切换控件 SHALL 在请求期间阻止重复操作，在成功前不改变本地模式，在失败后恢复原模式并提供可读错误提示；运行中的 Session SHALL 禁用切换控件。

#### Scenario: 切换成功

- **WHEN** 用户对 idle Session 选择另一个模式且 Protocol 返回成功
- **THEN** 页面更新模式标签并显示切换成功状态

#### Scenario: 切换失败

- **WHEN** Protocol 返回冲突、网络或服务错误
- **THEN** 页面保留旧模式，解除控件忙碌状态并提示用户重试

#### Scenario: Session 正在运行

- **WHEN** 当前 Session 状态为 running
- **THEN** Plan/Build 切换控件不可操作，并向用户说明需要等待本轮运行结束
