# HTTP 请求边界加固计划

## 任务 1：锁定 body 上限行为

- 增加服务测试，验证超限 Prompt body 被拒绝且不会进入 Coding Loop。

## 任务 2：统一 JSON 读取入口

- 替换 Server 内所有直接 `request.json()` 调用。
- 使用字节级上限，同时处理错误 `Content-Length` 和实际读取超限。
- 保持现有 caller-safe 错误码，避免泄露解析器细节。

## 任务 3：验证与交付

- 运行服务完整测试、根目录 `bun run check`、OpenSpec strict validation 和 diff 校验。
- 提交并合并回 `dev-v0.0.1`。
