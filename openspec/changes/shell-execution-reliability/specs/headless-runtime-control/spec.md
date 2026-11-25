# Spec Delta

## ADDED Requirements

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
