# @nexum/surface-adapter

Surface 面向协议的适配层：`ChatProtocolAdapter` 契约、协议错误归一化与基于 `@nexum/client` 的默认实现。聊天类 Surface（chat-surface、CLI 等）复用同一契约，不各自实现协议逻辑。

```ts
import { createChatProtocolAdapter } from "@nexum/surface-adapter"

const adapter = createChatProtocolAdapter({ baseUrl: "http://127.0.0.1:4097" })
```
