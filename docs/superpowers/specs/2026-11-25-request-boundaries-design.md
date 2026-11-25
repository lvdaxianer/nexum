# HTTP 请求边界设计

所有需要 JSON 的 Nexum HTTP 端点通过统一读取器消费请求体。读取器先检查可信的 `Content-Length`，再对实际 UTF-8 字节数设硬上限，最后解析 JSON；超限、空体或非法 JSON 都在路由边界转换为既有稳定的 `NEXUM_INVALID_REQUEST`，不会把无界 body 交给业务层。

本轮只收敛 body 资源边界，不改变业务字段校验和响应结构。
