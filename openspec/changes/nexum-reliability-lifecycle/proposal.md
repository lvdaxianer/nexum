# Proposal

## Why

Nexum 已经具备模型调用、工具执行、上下文压缩和有限模型重试，但错误分类过粗，自动重试期间的运行边界也没有完整对外表达。模型服务短暂不可用、请求超时、上下文超限和永久性请求错误需要不同的恢复路径，否则 Application 层无法可靠地保持运行态、提示用户或安全地继续任务。

现在补齐 Core、Protocol 和 Application 三层的可靠性契约，可以让一次运行在重试、超时、取消、恢复和最终结束之间保持一致，并为后续持久化 execution recovery 留出稳定边界。

## What Changes

- 在 Core 增加结构化模型失败信息和可配置的模型重试策略。
- 区分网络失败、超时、限流、上游服务失败、认证失败、无效请求、上下文超限和无效响应。
- 让模型重试支持 `Retry-After`、指数退避、抖动、最大等待时间和取消。
- 增加模型 Attempt 与运行 settled 语义，区分中间可恢复失败和最终 Session 终态。
- 在 Protocol 增加模型 Attempt、重试和 `run.settled` 事件契约。
- 在 Application 增加模型/工具超时映射、SSE 生命周期透传和从既有上下文继续运行的接口。
- 增加重复 continue/retry 请求的幂等边界，避免重复追加用户消息。
- 保持现有 PermissionPort、工具工作目录限制、单步一次模型流和已有 Session 状态语义。

## Capabilities

### New Capabilities

- `nexum-model-reliability`: 定义模型失败分类、Attempt、重试、退避、超时和取消行为。
- `nexum-run-lifecycle`: 定义三层运行生命周期、settled 终态、继续运行和客户端可观察事件。

### Modified Capabilities

- 无

## Impact

- Core：`packages/nexum-core/src/model.ts`、Coding Loop、模型和工具端口契约及相关测试。
- Protocol：`packages/nexum-protocol/src/index.ts` 与协议测试。
- Application：`packages/nexum-server/src/index.ts`、`packages/nexum-client`、`packages/nexum-surfaces/src/main.tsx` 及跨层测试。
- Adapter：OpenAI-compatible ModelPort 的 HTTP 错误解析、超时和重试元数据。
- API 文档和生成客户端：公共 HttpApi 变更后按仓库要求更新并运行 `packages/client` 的生成流程；Nexum Client 的手写/协议契约同步更新。
