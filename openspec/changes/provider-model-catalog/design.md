# Design

## Context

See `proposal.md` - Why。现有 `ModelPort` 只产生文本、reasoning、tool-call 和 completed chunk；OpenAI adapter 已解析稳定错误码，但非流式 usage 和 Provider/model 能力没有统一出口。

## Goals / Non-Goals

**Goals:**

- 定义 Provider、ModelCapability、ModelUsage 和 Cost 的小型通用 Core 契约。
- 目录读取是只读、可替换、caller-safe 的 Integrations 能力。
- OpenAI-compatible 的流式/非流式 usage 统一为可选字段，旧模型响应继续工作。
- Server/Client 只暴露 Provider ID、模型 ID、能力、上下文限制和计费摘要，不返回 credential 或原始错误体。

**Non-Goals:**

- 不在 Core 内注册 Provider SDK 或解析 Provider-specific 参数。
- 不实现远程模型计费结算；cost 仅是上游提供或目录声明的估算字段。
- 不修改既有 Prompt/Continue/Cancel admission 语义。

## Decisions

1. **ModelChunk 携带可选 usage。** 这样 usage 与模型响应生命周期关联，旧 ModelPort 不需要实现新必填方法；Runtime 事件和最终投影可按需消费。
2. **Catalog 独立于 ModelConfigStore。** Model config 表示当前选择，catalog 表示可发现能力；两者分开避免把 Provider 列表写进 Session 配置。
3. **目录返回安全元数据。** Provider adapter 可以内部使用 credential，但 public DTO 只返回 provider/model ID、capabilities、context window、pricing summary。
4. **错误维持现有 NexumModelError。** Provider adapter 继续映射 authentication/network/rate-limit/upstream/context-overflow；providerCode 只保留短、非敏感摘要。

## Risks / Trade-offs

- [Provider usage 字段位置不同] → OpenAI adapter 兼容流式末尾 usage 和非流式 usage，缺失时保持 undefined。
- [价格信息过期] → 标记为 estimate/source timestamp，不承诺结算准确性。
- [目录加载失败] → 返回空或 caller-safe unavailable 状态，不阻断已有模型调用。

## Migration Plan

1. 先加入 Core 可选类型和 Provider catalog port，并用 contract test 固化字段。
2. 接入 OpenAI-compatible adapter 的 usage/catalog 解析。
3. 增加 Server/Client `/providers` 查询并保留旧 model API。
4. 运行受影响测试、check、OpenSpec strict 后归档。
