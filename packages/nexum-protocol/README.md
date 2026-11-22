# @nexum/protocol

Nexum 对外协议数据模型：协议版本、HTTP JSON Envelope、能力发现、Session、Permission、Question、Skill、事件和 SSE 事件模型。

- 协议版本：`nexum.runtime.v1`
- HTTP 前缀：`/api/nexum`
- 请求响应：JSON Envelope，包含 `data` 和 `meta.protocolVersion`
- 能力发现：返回每项能力的 `id`、版本、启用状态和操作集合
- 事件传输：SSE，事件包含 `eventID`、`runID`、`sessionID`、`sequence` 和 `occurredAt`
