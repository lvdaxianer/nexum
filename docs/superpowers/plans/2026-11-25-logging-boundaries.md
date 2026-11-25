# HTTP 日志边界加固计划

> **执行约束：** 使用 `@superpowers:executing-plans`，完成后运行服务测试、根目录 `bun run check` 和 diff 校验。

## 任务 1：先锁定 logger 契约

- 测试 trace context 自动传播、敏感字段全局脱敏和诊断字段限长。
- 保留异常 stack 供内部诊断，但确保 token 不出现在日志中。

## 任务 2：替换 Server 日志边界

- 移除高频 `console.info` 请求开始/结束日志。
- 注入结构化 logger，异常只在统一 HTTP 边界记录一次。
- 让 Prompt、Continue、Session 删除等异步错误路径复用同一个 logger 和 trace context。

## 任务 3：验证与交付

- 运行 `packages/nexum-server` 完整测试、类型检查和根目录 `bun run check`。
- 运行 OpenSpec strict validation，提交并合并回 `dev-v0.0.1`。
