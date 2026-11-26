# Spec Delta

## MODIFIED Requirements

### Requirement: Runtime status SHALL distinguish model thinking from tool execution

运行时状态 SHALL 区分模型请求、工具执行、工具等待权限、工具超时、工具失败和取消；工具执行期间不得仅显示模型正在思考来代替真实状态。进入工具等待权限或 Question 等待状态后，后续模型 thinking/reasoning 心跳 MUST NOT 重新启动或覆盖交互输入提示，直到对应决定或回答提交。

#### Scenario: Shell is running

- **WHEN** Core 已发出 Shell 工具调用且命令尚未结束
- **THEN** 页面 SHALL 显示工具执行状态、工具名称和可观察的执行时长，而不是只显示模型思考

#### Scenario: Shell times out

- **WHEN** Shell 达到执行截止时间
- **THEN** 页面 SHALL 显示超时原因、停止状态和继续或重试入口

#### Scenario: Shell is cancelled

- **WHEN** 用户取消正在执行的 Shell
- **THEN** 页面 SHALL 显示取消已确认，并允许用户继续当前 Session 或重新提交任务

#### Scenario: Permission input remains usable during thinking heartbeat

- **WHEN** UI 已进入工具等待权限状态，随后又收到 `assistant.thinking` 或 `assistant.reasoning` 心跳
- **THEN** UI SHALL 保持权限交互提示和可输入状态，不得重新绘制思考动画覆盖权限选项
