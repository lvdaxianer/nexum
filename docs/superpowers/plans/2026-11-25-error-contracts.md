# HTTP 错误契约收敛计划

## 目标

让 Nexum Server 的公共错误响应只暴露稳定、可消费的错误信息，不透传领域异常文本。

## 实施

1. 审计 Server 中所有领域异常到 HTTP 的映射。
2. 按稳定错误码使用固定 caller-safe message。
3. 增加未知内部错误不泄露原始文本的回归测试。
4. 补充 body 上限和错误 message 边界文档。
5. 从受影响包运行测试和类型检查，再运行根目录 `bun run check`。

## 验收

- `packages/nexum-server/src/index.ts` 不再将领域异常 `message` 写入公共响应。
- 既有 status、errorCode、traceId 和成功响应保持兼容。
- Server 测试、类型检查、根目录检查和 OpenSpec strict 校验通过。
