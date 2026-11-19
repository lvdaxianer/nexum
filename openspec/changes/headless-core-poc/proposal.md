# Proposal

## Why

当前 OpenCode 的主要交互入口是 CLI、TUI 和 Web/Desktop 产品层，生产系统无法直接以 UI 无关的方式复用其 Session、Coding Loop、工具执行和权限审批能力。本变更先从 Fork 的 `dev-v0.0.1` 基线迁移一组最小核心能力，建立可被任意 UI 驱动的 Headless Service POC，验证后再继续扩大核心迁移范围。

## What Changes

- 新增独立的 Headless Service 入口，不依赖 TUI、Desktop 或完整产品 Web App。
- 提供创建 Session、发送任务、查询状态、取消任务和订阅运行事件的 HTTP/SSE 接口。
- 保留 Coding Loop 的最小闭环：模型响应、工具调用、工具结果回传和任务完成状态。
- 暴露工具权限请求和审批接口，支持一次允许、持久允许和拒绝。
- 支持一个最小 OpenAI-compatible 模型配置，包括 Base URL、API Key 和模型名称。
- 新增一个独立的简单 Web POC 页面，通过 Headless API 完成一次 Coding Task。
- 增加端到端测试，验证 Session、事件、权限审批和工具执行链路。
- 将 POC API 标记为实验性接口，后续允许在不兼容承诺下继续调整。

## Capabilities

### New Capabilities

- `headless-session-runtime`: 提供 UI 无关的 Session、Prompt、取消和运行事件能力。
- `tool-permission-approval`: 在工具执行前产生权限请求，并通过 API 接收 allow-once、allow-always 或 deny 决策。
- `model-runtime-config`: 提供单一 OpenAI-compatible 模型的运行时配置和校验能力。

### Modified Capabilities

无。

## Impact

- 影响 `packages/core`、`packages/server`、`packages/protocol`、`packages/schema`、`packages/sdk` 的组合方式，但第一期优先通过新 Headless Service 适配层迁移能力，不直接重构全部既有包。
- 新增 Headless Service 包和独立 Web POC 包；它们不得依赖 `packages/app`、`packages/tui` 或 `packages/desktop`。
- 新增实验性 HTTP/SSE API，并通过现有 Protocol/Client 生成机制维护类型一致性。
- 复用 OpenCode 的 Agent、Tool、Permission、Session 和事件运行时；模型凭据仅用于本地 POC，不进入版本库或普通日志。
- POC 默认只适合受控本地环境；生产沙箱、租户隔离、集中策略中心和高可用不在本变更范围内。
