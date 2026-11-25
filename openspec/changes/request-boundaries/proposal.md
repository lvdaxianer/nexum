# HTTP 请求边界加固

Nexum Server 的 JSON 端点直接调用 `request.json()`，请求方可以提交无界 body，导致解析和内存占用没有统一上限。本变更增加统一的字节级 JSON body 读取边界，保持现有稳定错误响应。
