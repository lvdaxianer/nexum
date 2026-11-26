# Proposal

## Why

Nexum 当前已分别保护文件路径、Shell 输出和权限策略，但工具请求仍以原始字符串传递，网络、凭据、重定向和子 Shell 风险没有统一的可观察语义。现在补齐 Host/Sandbox 边界，可以让同一套风险信息同时服务 Permission、日志和未来的远程沙箱，而不把具体容器实现带入 Core。

## What Changes

- 为 Host 资源增加稳定的 action、归一化 resource 和 risk 分类。
- 让内置文件与 Shell 工具在进入 Permission 前使用统一资源描述，并识别网络、凭据、重定向和危险 Shell 组合。
- 增加可注入的 Sandbox Host 装饰器，统一限制动作和结果大小；默认本地 Host 保持可用。
- 保持现有 HostPort、Permission decision 和工具 HTTP API 的兼容；新增字段为可选或内部派生字段。
- 继续使用进程组终止、超时、取消和输出脱敏边界，不引入 Docker 或新的外部运行时依赖。

## Capabilities

### New Capabilities

- `host-security-boundary`: 统一 Host 资源风险、沙箱限制、结果上限和取消清理语义。

### Modified Capabilities

- 无。

## Impact

- 影响 `nexum-core` Host/Permission/Tool 契约、`nexum-integrations` 本地 Host 和新增 Sandbox adapter、Application 工具注册。
- Protocol/Server 仅补充 caller-safe 风险字段到内部诊断，不改变 Prompt/Continue/Cancel 路由。
- 不增加运行时依赖；包依赖方向保持 Core → Integrations/Application → Server。
