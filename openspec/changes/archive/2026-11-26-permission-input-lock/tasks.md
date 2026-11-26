# Tasks

## 1. Renderer 状态保护

- [x] 1.1 在权限或 Question 等待状态下阻止 thinking/reasoning 心跳重新启动活动动画，并保持等待状态；用 Renderer 回归测试验证权限输入行不被覆盖

## 2. 验证与交付

- [x] 2.1 运行 `packages/nexum-cli` 的测试与类型检查，确认权限交互相关测试和既有测试全部通过
- [x] 2.2 运行项目级 `bun run check`，检查变更差异并完成代码审查与 OpenSpec 验证

## Workflow follow-up

- 通过工作流的逐任务审计后提交变更。
- 将任务分支合并回当前确认的集成分支，确认集成分支包含修复后再清理工作树。
