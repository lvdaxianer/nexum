# HTTP 日志边界加固

Nexum Server 当前直接使用 `console.info/error` 输出请求生命周期和原始异常对象，存在高频日志噪声、敏感信息泄露、异步链路缺少统一上下文和诊断字段无界增长的问题。

本变更增加 Server 内部结构化 logger，统一 trace context、脱敏、限长和异常 stack 边界，并移除正常请求的高频日志。
