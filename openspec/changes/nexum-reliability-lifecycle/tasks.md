# Tasks

## 1. Core 模型可靠性

- [x] 1.1 扩展 Nexum 模型失败契约和 OpenAI-compatible Adapter 分类，支持网络/超时/限流/上游服务/认证/无效请求/上下文超限/无效响应、Retry-After 和最大重试等待；保持未产生可见增量才自动重试，并通过 Core 与 Adapter 测试验证 4xx/401/429/5xx、脱敏和退避行为。

## 2. Core 运行生命周期

- [x] 2.1 增加模型 Attempt、运行级 timeout、可取消退避和 `run.settled` 领域事件；为模型流空闲、工具超时、取消、重试耗尽和上下文压缩恢复补充 Core 测试。
- [x] 2.2 增加从既有 user/tool-result 上下文继续运行的 Core 能力，拒绝 assistant 尾部或无可继续上下文，并验证不会重复追加用户消息。

## 3. Protocol 与 Client

- [ ] 3.1 增加 Attempt、Retry、Settled 事件及安全数据类型，并按实验性 API 约定定义 continue 请求/响应；运行 Protocol、Client 契约测试并确认事件类型与字段顺序稳定。

## 4. Application 接入

- [ ] 4.1 Server 增加 continue 路由、请求校验、Session 冲突和稳定错误映射，SSE 原样透传生命周期事件；补充 Server HTTP/SSE 测试。
- [ ] 4.2 Surface 消费重试和 settled 事件，保持自动重试期间运行态，提供失败后的 continue 操作并验证重复点击不会产生并发运行；运行 Surface 类型检查和 smoke 测试。

## 5. 集成验证与交付

- [ ] 5.1 完成三层边界审查、OpenSpec 严格校验、相关包测试/typecheck、`git diff --check` 和根级 `bun run check`，确认文档与实现一致。

## Workflow follow-up

- 每个任务通过 TDD、领域审查、计划一致性审查和 per-task audit 后单独提交并合并回 `dev-v0.0.1`。
- 全部任务完成后执行 OpenSpec verify、最终审计和 archive，并确认集成分支包含所有任务提交。
