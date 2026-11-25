# Proposal

## Why

Nexum 当前把完整的 Session、Shell、模型和 MCP 能力暴露在同一个服务边界内，非回环监听、无界输出、无限等待和不安全远程地址会把本地开发能力放大为服务端风险。现在先固化这些运行边界，才能让页面“模型正在思考”和 Shell 卡住时都有可恢复、可诊断的终态。

## What Changes

- 非回环监听必须配置 Bearer token，业务 API 拒绝未认证请求。
- Local Host 为文件读取、文件写入和 Shell 输出增加可配置上限，并拒绝符号链接逃逸。
- Model Probe 传播请求取消信号，并使用有限的整体 deadline。
- MCP 配置和 SDK 连接阶段拒绝本地、私网、元数据地址及携带隐藏状态的 URL。
- 为上述边界增加 focused、package-level 和服务级测试。

## Capabilities

### New Capabilities

- `runtime-auth-boundary`: 保护非回环 Nexum 服务及其高风险 API。
- `mcp-network-boundary`: 限制远程 MCP 连接的 URL 和 DNS 目标范围。

### Modified Capabilities

- `nexum-model-reliability`: 增加 Model Probe 的取消和整体超时语义，并强化 Shell/模型等待边界。

## Impact

- 影响 `packages/nexum-server`、`packages/nexum-core` 和 `packages/nexum-integrations` 的公开 TypeScript 端口与错误语义。
- 回环开发默认行为保持兼容；非回环部署需要新增 `authToken` 配置。
- 不引入新的运行时依赖，DNS 校验复用 Node/Bun 标准库。
