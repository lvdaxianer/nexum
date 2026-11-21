# Design

## Context

Headless UI 与 API 默认由同一台服务器提供，但浏览器执行 JavaScript 时 `127.0.0.1` 指向用户自己的设备，而不是提供 UI 的服务器。当前代码的硬编码默认值只适用于浏览器和 API 同在本机的开发场景。

## Decision

在 `packages/headless-ui/src/main.tsx` 创建 API Client 时，优先使用构建时的 `VITE_HEADLESS_API_URL`；未提供时使用 `window.location.protocol`、`window.location.hostname` 和固定 API 端口 `4097` 生成运行时地址。这样保留本地开发和反向代理的显式覆盖能力，同时让部署后的页面天然访问同一服务器上的 API。

## Verification

冒烟测试将 UI 绑定在 `127.0.0.2:5173`，API 绑定在 `0.0.0.0:4097`，并断言页面初始化请求命中 `127.0.0.2:4097`。旧实现会请求 `127.0.0.1:4097`，因此测试必须先在旧实现上失败。

## Non-Goals

- 不新增环境变量。
- 不修改 Session 工作目录的服务端可读性校验。
- 不在本次变更中引入 API 代理、域名发现或动态端口协商。
