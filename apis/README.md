# apis

`apis/` 保存面向外部调用方的 API 说明。它描述 Headless Core 对外暴露的资源、请求参数、响应结构和事件语义，不承载服务端运行时代码。

## 目录职责

- `headless.md`：Headless API 的人工可读说明，适合 UI、集成方和联调人员查阅。
- 协议字段的权威定义仍在 [`packages/protocol`](../packages/protocol/README.md)；这里用于补充使用场景和示例。

## 维护边界

新增或修改接口时，先更新 Protocol Schema 和服务端实现，再同步本目录的使用说明。不要在这里复制一份会与生成客户端漂移的类型定义。

## 验证

从仓库根目录运行：

```bash
bun run --cwd packages/protocol check:generated
bun test --cwd packages/headless-server
```
