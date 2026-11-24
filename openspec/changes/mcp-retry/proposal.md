# MCP 连接失败重试

## Why

Nexum 当前首次 MCP 连接失败后需要 Client 手动再次调用 `connect`，而连接建立后的断线恢复与首次连接使用了不同语义。Client 页面也没有可靠的启动初始化状态，无法区分正在建立连接、自动重试、需要 OAuth 和最终失败。

## What Changes

- 在 Core Registry 中统一首次连接、断线和 Session 恢复的有限重试调度。
- 增加 `retrying` 状态、尝试次数和下一次重试时间的安全 DTO。
- 在 Local Runtime 启动时恢复 MCP 配置并异步发起初始连接。
- 让 Server/Client 页面观察并控制重试，不在浏览器创建 MCP transport。

## Scope

本变更只覆盖单进程 MCP 生命周期和 Client 状态同步，不引入多进程协调，也不改写官方 SDK 的 OAuth/HTTP 实现。
