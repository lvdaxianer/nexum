# headless-session-control Specification

## Purpose
让页面成为 Coding Task 的唯一操作入口，能够创建、选择、恢复、推进和停止 Session，并在网络或页面刷新后继续看到可信的运行状态。

## Requirements

### Requirement: 页面可以管理 Session 生命周期

Headless Service SHALL 提供创建、列出、查询和取消 Session 的稳定接口，页面 SHALL 能基于这些接口选择当前任务并显示其目录与生命周期状态。

#### Scenario: 创建并选中 Session
- **WHEN** 用户在页面提交一个可读写的工作目录
- **THEN** 页面创建 Session、将其设为当前 Session，并显示 `idle` 状态

#### Scenario: 列出并切换历史 Session
- **WHEN** 页面请求 Session 列表并选择其中一个 Session
- **THEN** 页面显示该 Session 的目录、状态，并重新连接该 Session 的事件流

#### Scenario: 拒绝无效工作目录
- **WHEN** 用户提交不存在、非绝对路径或不可读写的目录
- **THEN** 服务返回稳定的 caller-safe 错误，页面保留用户输入并提示可恢复原因

### Requirement: 页面可以提交和停止 Coding Task

页面 SHALL 通过统一控制区提交 Prompt、取消当前运行，并在请求进行期间阻止重复提交；服务 SHALL 返回明确的 accepted、completed、failed 或 cancelled 状态。

#### Scenario: 提交 Prompt
- **WHEN** 当前 Session 为 `idle` 且用户提交非空 Prompt
- **THEN** 页面显示运行中状态并通过事件流展示后续运行事件

#### Scenario: 取消运行
- **WHEN** 当前 Session 正在运行且用户点击取消
- **THEN** 页面显示取消进行中，收到 `session.cancelled` 后恢复可操作状态

#### Scenario: 重复点击提交
- **WHEN** Prompt 请求尚未返回且用户再次点击提交
- **THEN** 页面不发出第二个等价请求，并保持输入内容和进行中反馈

### Requirement: 页面可以恢复事件与运行队列

页面 SHALL 能重新连接当前 Session 的 SSE 事件流，并刷新待审批权限和待回答 Question；事件内容 SHALL 继续经过服务端安全脱敏。收到当前 Session 的完成、失败或取消终态事件后，页面 SHALL 按稳定 Session ID 增量更新 Session 列表中的对应状态，不得要求用户手动刷新列表才能看到本轮结果。

#### Scenario: 运行完成后同步 Session 列表

- **WHEN** 当前 Session 收到 `run.settled` 或对应的终态事件
- **THEN** 左侧 Session 列表中的该项立即显示 `completed`、`failed` 或 `cancelled`，其他 Session 项保持不变

#### Scenario: 页面刷新后恢复
- **WHEN** 页面重新加载且存在当前 Session 标识
- **THEN** 页面加载该 Session 的分页消息历史、重新连接事件流并刷新权限、Question 和 Session 状态，不要求用户重新创建任务

#### Scenario: 事件流断开
- **WHEN** SSE 连接断开
- **THEN** 页面显示断线状态，保留已展示的事件，并提供可重复点击的重新连接操作
