# Spec Delta

## ADDED Requirements

### Requirement: Session 生命周期 SHALL 保留 Agent 模式

Session 的创建、列表、查询、更新和状态同步 SHALL 保留当前 Agent 模式；缺少历史模式数据时 SHALL 以 Build 作为兼容值。

#### Scenario: 列表返回当前模式

- **WHEN** 页面请求 Session 列表
- **THEN** 每个 Session 项包含 `plan` 或 `build` 模式

#### Scenario: 状态更新不丢失模式

- **WHEN** Session 从 idle 进入 running 或 terminal 状态
- **THEN** 状态响应和页面增量更新继续保留原 Agent 模式

### Requirement: Session 创建 SHALL 接受初始 Agent 模式

Session 创建接口 SHALL 接受可选的 `mode` 参数，并在校验失败时不创建部分 Session 或修改现有 Session。

#### Scenario: 创建 Build Session

- **WHEN** 用户提交工作目录和 `mode: "build"`
- **THEN** 服务创建 Build Session 并返回其稳定标识和模式

#### Scenario: 拒绝非法创建模式

- **WHEN** 创建请求携带非法 mode
- **THEN** 服务返回 caller-safe 参数错误，且 Session 列表不增加记录

### Requirement: Agent 模式切换 SHALL 遵守 Session 运行边界

空闲或终态 Session SHALL 支持幂等地切换 Plan/Build；运行中的 Session SHALL 拒绝改变模式并保留原值。

#### Scenario: 空闲 Session 切换模式

- **WHEN** 用户对 idle Session 选择另一个合法模式
- **THEN** 服务持久化新模式并返回更新后的 Session

#### Scenario: 运行中拒绝切换

- **WHEN** 用户对 running Session 请求不同模式
- **THEN** 服务返回稳定冲突错误，且原模式保持不变
