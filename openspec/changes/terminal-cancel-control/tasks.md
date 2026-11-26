# Tasks

## 1. 核心层状态能力

- [x] 1.1 在 Core 增加可取消状态判断和终态取消拒绝，先写失败测试，再验证 Core 生命周期测试通过

## 2. 协议层状态契约

- [x] 2.1 在 Protocol Session State 增加 `canCancel` 并由 Server 投影，更新契约/接口测试，验证状态字段和终态取消错误稳定

## 3. 应用层取消入口

- [x] 3.1 让 ChatSurface 使用协议 `canCancel` 控制取消入口，保留确认和忙碌反馈，并验证运行中可取消、完成后隐藏
- [x] 3.2 扩展真实 UI smoke，覆盖运行完成、失败和取消后的按钮状态

## 4. 集成验证

- [x] 4.1 执行 OpenSpec strict 校验、各层定向测试、定向 UI smoke、`bun run check` 和 `git diff --check`

## Workflow follow-up

- 通过代码审查与任务审计后提交修复分支。
- 合并回 `dev-v0.0.1`，归档 OpenSpec change，并恢复主工作区已有改动。
