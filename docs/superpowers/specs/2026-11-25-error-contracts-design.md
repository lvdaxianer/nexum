# HTTP 错误契约设计

## 公共边界

领域错误的 `code` 是公共映射依据；`message` 只供内部日志和开发诊断使用。HTTP 响应维持现有 `status`、`errorCode`、`message`、`traceId` 和 `meta` 结构。

## 安全约束

错误响应不能包含本地绝对路径、上游 URL、凭据、堆栈或任意内部异常文本。客户端应依赖 `errorCode` 处理分支，`message` 仅用于展示。

## 请求边界

JSON 请求体统一限制为 1 MiB。超出上限或无法解析时返回稳定的 `NEXUM_INVALID_REQUEST`，服务端不启动对应业务操作。
