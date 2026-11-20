# Headless Protocol v1：统一页面接入协议

## Why

当前 Headless Core 已经具备模型调用、Coding Loop、工具权限、Question、上下文压缩和 Skill 能力，但页面接入仍需要了解多个内部返回结构，并自行处理事件顺序、断线恢复和运行状态重建。这样会让不同 UI 重复实现协议适配，增加安全字段泄露和恢复不一致的风险。

本变更将 Core 的外部能力收敛为稳定的 HTTP/JSON + SSE 协议，页面只依赖公开契约，不依赖 Core 内部模块。

## What Changes

- 为 Headless REST 接口增加统一成功响应元数据和稳定错误响应格式。
- 增加能力发现接口，使页面能够按协议版本和能力集合初始化。
- 为运行事件补充 `eventID`、`runID`、`occurredAt` 和标准 SSE `event`/`id` 字段。
- 为 SSE 增加有限历史重放和 `Last-Event-ID` 断线恢复语义。
- 增加会话状态快照接口，页面刷新后可以恢复运行状态、待处理权限和 Question。
- 补充中文协议文档、页面接入时序、示例和安全约束。

## Capabilities

### New Capabilities

- `headless-protocol-contract`: 统一 REST 响应、错误、能力发现和兼容性契约。
- `headless-runtime-events`: 统一运行事件身份、SSE 格式和有限重放。
- `headless-session-recovery`: 提供页面恢复所需的会话状态快照。

### Modified Capabilities

无。现有模型、权限、Question、上下文和 Skill 业务语义保持不变，只标准化其外部协议表达。

## Impact

- 影响 `packages/protocol` 的 Headless Schema 和生成客户端。
- 影响 `packages/headless-core` 的运行事件身份和序列分配。
- 影响 `packages/headless-server` 的响应封装、能力发现、状态快照和 SSE。
- 更新 `apis/headless.md` 作为唯一 Headless API 模块协议文档。
- POC 阶段不新增认证实现；生产部署仍必须由网关或宿主应用提供身份认证、授权和 TLS。
