# Proposal

## Why

Nexum 当前只有一个 OpenAI-compatible 入口，虽然已经能分类模型错误和读取 retry-after，但客户端无法发现 Provider、模型能力或成本信息。补齐统一目录和 usage 语义，可以让 CLI、Web、ACP 在不修改 Coding Loop 的前提下选择模型并展示可审计的用量。

## What Changes

- 在 Core 增加 Provider/模型能力、usage 和 cost 的通用类型；ModelPort 保持 Provider-agnostic。
- 在 Integrations 增加 Provider catalog 与 OpenAI-compatible catalog adapter，返回脱敏的模型元数据。
- OpenAI-compatible 响应解析 usage、reasoning 和 finish reason，并通过统一 ModelChunk 字段传递。
- 增加 Server/Client 的 Provider catalog 查询，错误和 credential 仍只返回安全摘要。
- 保持现有 model 配置、Prompt/Continue/Cancel 和旧 Provider 调用兼容。

## Capabilities

### New Capabilities

- `provider-model-catalog`: Provider、模型能力、usage/cost 和安全目录查询。

### Modified Capabilities

- 无。

## Impact

- 影响 `nexum-core` model 契约、`nexum-integrations` OpenAI adapter、`nexum-application` Provider 组合、`nexum-protocol/server/client` 查询接口及相关测试。
- 不引入新的 Provider SDK 或外部依赖。
