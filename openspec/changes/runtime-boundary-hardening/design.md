# 运行边界加固设计

## Architecture

服务层决定认证是否启用并在请求入口校验 Bearer token；Core 的 Model Probe 负责把一个整体 deadline 传播给每个模型调用；Integration 层负责文件 canonicalization、输出裁剪和 MCP DNS 目标检查。默认回环开发保持匿名兼容，非回环服务 fail fast。

## Error Contract

认证失败返回 401 和 `NEXUM_AUTH_REQUIRED`；Model Probe 超时返回 504 和 `NEXUM_MODEL_PROBE_TIMEOUT`；MCP 不安全目标返回 `invalid_config`。响应继续使用现有 `errorCode/message/traceId` 结构，不返回原始上游错误。

## Resource Boundaries

Local Host 的 read、write、stdout 和 stderr 均有字节上限。路径校验先 canonicalize 工作目录和现有目标，再校验最近的真实父目录，避免通过符号链接离开 Session 目录。Shell 超时和取消保留现有进程组终止与清理 deadline。

## Verification

验证包括 Local Host、Model Probe、MCP SDK 的 focused tests，server/core/integrations package tests，以及根目录 `bun run check`。非回环认证、DNS 解析到私网和 Probe 不产出 chunk 均必须有失败转通过的测试证据。
