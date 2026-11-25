# Core 运行失败消息收敛

Core 的 `session.failed` 事件目前可能把任意异常 `message` 写入事件流，UI 和其它订阅者会因此看到内部路径、上游响应或工具输出。按稳定错误类型映射 caller-safe 文案，未知异常使用通用失败消息。
