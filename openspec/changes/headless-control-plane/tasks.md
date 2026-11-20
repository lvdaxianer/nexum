# Tasks

## 1. Runtime 控制端口

- [x] 1.1 在 `packages/headless-core` 增加只读 Session 列表端口和安全模型 Probe 端口；先为缺少能力、文本响应和 Function Calling 响应写 RED 测试，再实现最小代码并通过 Core 全量测试与类型检查。

## 2. Headless API 与客户端契约

- [x] 2.1 在 `packages/headless-server` 增加 Session 列表和模型 Probe 路由，补齐输入校验、稳定错误、traceId 和凭据不回显；先写 HTTP RED 测试，再通过 Server 全量测试和类型检查。
- [x] 2.2 在 `packages/protocol` 和 `packages/client` 增加对应 Schema、OpenAPI 注解和生成客户端接口，验证 Protocol 定向测试、Headless generated client 测试和类型检查通过。

## 3. 页面控制台

- [x] 3.1 在 `packages/headless-ui` 增加模型 Probe、Session 列表/切换、重连/刷新、运行控制和错误恢复状态；先扩展 Playwright smoke 覆盖页面操作，再实现控件并通过 UI 类型检查、构建和 smoke。
- [x] 3.2 将权限、Question、工具结果、上下文压缩和项目上下文统一整理成页面控制台分区，验证权限、Question、压缩、项目上下文、Probe、恢复和凭据脱敏场景均有可见结果。

## 4. 集成收口

- [x] 4.1 完成跨包回归、OpenSpec strict validate、`git diff --check`、安全模式审计和最终页面验收，确认 `dev-v0.0.1` 合并后工作区干净。

## Workflow follow-up

- 每个实现任务完成后执行独立审计、代码评审、测试和 Conventional Commit，再合并回 `dev-v0.0.1` 并清理任务 worktree。
- 所有任务完成后归档 `headless-control-plane` OpenSpec change，并验证归档结果。
