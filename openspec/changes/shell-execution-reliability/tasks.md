# Tasks

## 1. Core 工具生命周期测试与边界

- [x] 1.1 在 `packages/nexum-core/test/run-lifecycle.test.ts` 增加工具超时、工具取消和工具结果元数据测试，先验证 `tool.result`、Session 终态和单次 `run.settled` 的事件顺序
- [x] 1.2 在 Core 中归一化默认工具超时，区分未配置、显式关闭和自定义时限；运行 `cd packages/nexum-core && bun test test/run-lifecycle.test.ts` 验证边界
- [x] 1.3 在工具调用边界将超时/取消转换成稳定的工具失败或取消结果，并确保异常路径不会遗留 running Session；运行同一测试文件验证既有模型失败和取消用例不回归

## 2. 本地 Shell 进程与输出清理

- [x] 2.1 为 `packages/nexum-integrations/src/local-host.ts` 增加可配置的 Shell 总截止时间和清理截止时间，并先编写不会退出、保持 stdout/stderr 打开的测试夹具
- [x] 2.2 实现 AbortSignal、超时、优雅终止、硬终止和 POSIX 进程组/直接子进程回退清理，确保 stdout/stderr 不再以 EOF 作为唯一结算条件
- [x] 2.3 为 Shell 超时、取消、非零退出、输出截断和后台子进程残留增加集成测试；运行 `cd packages/nexum-integrations && bun test` 验证进程最终退出且 Promise 在截止时间内 settle
- [x] 2.4 保持 `packages/nexum-application/src/local-tools.ts` 的无 Host 回退路径具有同等取消与截止时间语义；运行 `cd packages/nexum-application && bun test` 验证本地工具注册表不回归

## 3. 前端状态投影与回归测试

- [x] 3.1 更新 ChatSurface 的工具结果投影，使 timeout/cancelled 元数据显示为明确终态并保留恢复入口；运行 `cd packages/nexum-chat-surface && bun test` 验证投影结果
- [x] 3.2 更新思考心跳与工具项的优先级，补充交错事件和重复 settled 事件测试；验证工具执行期间不会重新显示为仅模型思考
- [x] 3.3 启动隔离前后端并验证 Surface 可访问、Session SSE 可连接；Shell 卡住后的终态由 Core、Integrations 和 ChatSurface 回归测试覆盖

## 4. 集成验证与交付

- [x] 4.1 运行 `openspec validate shell-execution-reliability --strict` 并运行受影响包的 typecheck，确认规格、类型和测试一致
- [x] 4.2 从仓库根目录运行 `bun run check`，修复本变更引入的 lint、类型和生成检查问题
- [x] 4.3 启动前后端，在隔离端口验证 capabilities、前端 HTTP 200 和 Session SSE 连接；本地挂起 Shell 夹具由真实 Host 集成测试验证在截止时间内 settle
- [x] 4.4 按项目代码评审与收尾流程完成 diff 审查、提交和 OpenSpec 归档前验证

## Workflow follow-up

- 完成项目要求的代码审查、提交和最终工作区审计后，再归档该 OpenSpec change。
- 归档后重新运行验证，确认主规格包含本次稳定行为。
