# 模型运行时能力

状态：现状基线

权威来源：`packages/nexum-core/src/model.ts`、`packages/nexum-core/src/index.ts`、`packages/nexum-integrations/src/openai-model.ts`、`packages/nexum-application/src/configured-loop.ts`

最后核对：2026-11-24

## 1. 调用链

```text
Model Config Store
  → OpenAI-compatible ModelPort
  → Core Coding Loop
  → model.attempt / text / tool / terminal events
  → EventHub / SSE / ChatSurface
```

Application 在没有显式注入 `ModelPort` 时，用 `NexumModelConfigStore` 创建 OpenAI-compatible Adapter；显式注入模型主要用于测试、替换供应商或离线运行。

Adapter 请求固定发送 `stream: true`，将上游流式增量归一化为 reasoning、text、tool call 和 completed；对直接返回 JSON 的网关提供非流式兜底。模型配置的公共视图只有 `baseUrl`、`model`、`credentialConfigured` 和可选 `credentialRef`，不返回 credential 原文。

## 2. 稳定错误分类

Core 的 `NexumModelErrorCode` 包括：

`not_configured`、`authentication_failed`、`network_error`、`timeout`、`rate_limited`、`upstream_error`、`invalid_request`、`unavailable`、`context_overflow`、`invalid_response`。

其中 `network_error`、`timeout`、`rate_limited`、`upstream_error`、`unavailable` 默认可重试；认证、无效请求、无效响应和未配置不会自动重复同一请求。HTTP 408/504、429、5xx 和明确的上下文过大响应由 Adapter 归类；`Retry-After` 可转为受限等待时间。

## 3. 重试、取消和可见输出

每次模型请求先发布 `model.attempt`。在没有产生任何可见增量时，短暂错误最多重试 `maxModelRetries` 次，等待采用有上限的指数退避与抖动，并尊重上游 `Retry-After`。等待期间收到取消会立即中止退避和后续请求。

一旦当前流已经产出 reasoning 或 text，Core 不透明重放该模型步骤，避免重复输出和重复工具副作用。达到重试上限后发布最终失败语义，Session 进入 `failed`，调用方可依据 `canContinue` 或 Continue 语义决定下一步。

## 4. 超时边界

可配置的边界包括：

| 配置                               | 作用                         |
| ---------------------------------- | ---------------------------- |
| `modelTimeoutMs`                   | 模型流两次增量之间的最大等待 |
| `toolTimeoutMs`                    | 单次工具执行最大等待         |
| `runTimeoutMs`                     | 一次 Coding Loop 运行总时限  |
| `maxModelRetries`                  | 可重试模型错误的次数上限     |
| `retryDelayMs` / `maxRetryDelayMs` | 退避基础和上限               |

超时使用 `AbortSignal` 传播到模型和工具；Coding Loop 将超时转换为稳定错误，并在可观察事件和 Session 终态中表达。工具超时不应被 UI 当成普通模型重试。

## 5. 上下文超限

模型明确返回 `context_overflow` 时，Core 可在配置了 `ContextCompactionPort` 的前提下触发一次强制压缩，再重新构造当前请求；成功后把 summary 和保留的最近消息写入 canonical history，失败则发布 `context.compaction.failed` 并结束当前运行。

上下文压缩和模型重试是两种不同恢复：重试针对没有可见输出的短暂上游故障；压缩针对上下文窗口不足，不得无限交替重试。

## 6. 相关入口

- [模型可靠性规范](../../openspec/specs/nexum-model-reliability/spec.md)
- [Context 与 History](context-and-history.md)
- [事件与 SSE](events.md)
- [模型适配器测试](../../packages/nexum-core/test/model-adapter.test.ts)
- [运行时事件测试](../../packages/nexum-core/test/runtime-event.test.ts)
- [Nexum HTTP API](../../apis/nexum.md)
