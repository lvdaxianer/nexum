# @opencode/protocol

`@opencode/protocol` 是 HTTP API、事件流和 OpenAPI 的契约层。它定义请求、响应、错误和事件的结构，供 Server、Client 和外部 UI 共同使用。

## 目录职责

- `src/api.ts`：Effect HttpApi 契约。
- `src/client.ts`：协议侧客户端投影和传输辅助。
- `src/errors.ts`：标准错误结构。
- `src/simulation.ts`：协议模拟支持。
- `openapi.json`：生成并提交的 OpenAPI 文档。
- `script/`：生成、稳定化和打包脚本。

修改接口时以这里的契约为起点，再同步服务端实现和 [`client`](../client/README.md) 生成结果。不要让页面自行定义另一套消息格式。

## 验证

```bash
bun run --cwd packages/protocol check:generated
bun test --cwd packages/protocol
```
