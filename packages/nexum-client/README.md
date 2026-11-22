# @nexum/client

基于标准 `fetch` 的 Nexum HTTP/SSE Client，不依赖 Core、Server 或具体 UI。它只负责协议编码、Envelope 校验、稳定错误和 SSE 解析。

```ts
import { Nexum } from "@nexum/client"

const client = Nexum.make({ baseUrl: "http://127.0.0.1:4097" })
const capabilities = await client.capabilities()
```
