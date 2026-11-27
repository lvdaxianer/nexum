# apis

[English](../README.md)

`apis/` 保存面向外部调用方的 API 说明。它描述 Nexum Runtime 对外暴露的资源、请求参数、响应结构和事件语义，不承载服务端运行时代码。

项目级总入口是根目录的 [`README.md`](../../README.zh-CN.md)。当前 Runtime API 的完整业务模块文档是 [`nexum.md`](nexum.md)。

联调时同时参考：[UI 交互协议](../../docs/zh-CN/ui/interaction-protocol.md)、[UI 状态](../../docs/zh-CN/ui/states.md)、[Session 能力](../../docs/zh-CN/capabilities/session.md)、[事件能力](../../docs/zh-CN/capabilities/events.md) 和 [`@nexum/server` 模块文档](../../docs/zh-CN/modules/nexum-server.md)。

## 目录职责

- `nexum.md`：Nexum Runtime API 的人工可读说明，适合 UI、集成方和联调人员查阅。
- 协议字段的权威定义仍在 [`packages/nexum-protocol`](../../packages/nexum-protocol/README.md)；这里用于补充使用场景和示例。
- Nexum 的独立协议模型位于 [`packages/nexum-protocol`](../../packages/nexum-protocol/README.md)，HTTP/SSE 实现位于 [`packages/nexum-server`](../../packages/nexum-server/README.md)。

## 维护边界

新增或修改接口时，先更新 Protocol Schema 和服务端实现，再同步本目录的使用说明。不要在这里复制一份会与生成客户端漂移的类型定义。

## 验证

从仓库根目录运行：

```bash
bun run --cwd packages/nexum-protocol typecheck
bun test --cwd packages/nexum-server
```
