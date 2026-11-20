# Headless Protocol Contract Specification

## Purpose

为任何页面或宿主 UI 提供稳定、可发现、可生成客户端的 Headless REST 协议契约。

## ADDED Requirements

### Requirement: REST 成功响应 SHALL 使用统一 Envelope

所有 v1 Headless REST 成功响应 SHALL 返回 `data` 和 `meta`。`meta.protocolVersion` SHALL 为 `headless.v1`，`meta.traceId` SHALL 与响应头 `x-trace-id` 一致。

#### Scenario: 页面读取模型配置

- **WHEN** 页面请求模型配置且服务正常
- **THEN** 响应返回 `{data,meta}`，并且 `data` 不包含明文凭据

### Requirement: REST 错误响应 SHALL 使用稳定字段

所有 v1 Headless REST 错误响应 SHALL 返回 `errorCode`、`message`、`traceId` 和 `meta`，并且不得包含堆栈、绝对路径、凭据或完整上游响应。

#### Scenario: 请求不存在的会话

- **WHEN** 页面请求不存在的会话状态
- **THEN** 服务返回 HTTP 404、稳定的 `errorCode` 和可用于日志关联的 `traceId`

### Requirement: 服务 SHALL 暴露能力发现接口

服务 SHALL 提供 `GET /api/experimental/headless/capabilities`，返回协议版本、HTTP/SSE 传输方式、支持的能力和事件类型。

#### Scenario: 页面初始化能力

- **WHEN** 页面首次连接服务
- **THEN** 页面可以仅通过能力响应判断是否支持模型、会话、权限、Question、上下文、Skill 和事件流

### Requirement: 事件能力清单 SHALL 与服务输出一致

能力发现返回的事件类型 SHALL 覆盖服务可能输出的标准 Headless 事件，避免页面订阅到未声明的事件类型。

#### Scenario: 页面构建事件处理器

- **WHEN** 页面根据能力响应注册事件处理器
- **THEN** 页面可以为每个声明事件建立处理分支，并对未知事件保持向后兼容
