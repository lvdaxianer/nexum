# HTTP 日志边界设计

## 目标

让 Nexum Server 的日志只记录受控摘要，并在异步请求、异常和敏感字段场景下保持可关联、可脱敏、可限长。

## 设计

- 通过 Server 内部 `NexumLogger` 统一输出结构化 WARN/ERROR JSON Lines。
- 用 `AsyncLocalStorage` 传播请求 `traceId`，日志器自动附带上下文并在 Promise 链结束后清理。
- 所有异常由 logger 统一提取 `name/message/stack`，经递归敏感字段脱敏和字符串限长后输出。
- 正常请求不写高频 INFO 开始/结束日志；认证失败和其他 caller-safe 响应仍由 HTTP 层返回，不把原始异常返回客户端。

## 不在本次范围

- 引入外部日志依赖、日志文件轮转或远程采集器。
- 将 CLI 面向用户的 stderr/stdout 提示改造成服务日志；CLI 输出属于交互协议。
