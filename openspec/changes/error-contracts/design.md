# Design

Server 只根据已知领域错误的稳定 `code` 选择公共 HTTP message，不再透传领域异常的原始 `message`。错误详情保留在服务端结构化日志中，由 `traceId` 关联排障。

这次只收敛错误响应内容，不改变 HTTP status、`errorCode`、响应 envelope 或 Protocol 类型，因此不需要生成 Client 文件。JSON 请求体上限继续由统一读取入口负责，文档明确该边界。
