# runtime-auth-boundary Specification

## Purpose

保护非回环 Nexum 服务，避免未认证调用者直接使用 Session、Shell、模型配置、权限和 MCP 能力。

## ADDED Requirements

### Requirement: Non-loopback service SHALL require authentication

当服务监听地址不是本机回环地址时，启动配置 SHALL 提供非空认证 token；缺少 token 时服务 SHALL fail fast，不得以匿名模式启动。

#### Scenario: Missing token on non-loopback host

- **WHEN** 服务以 `0.0.0.0` 或其他非回环地址启动且没有 `authToken`
- **THEN** 启动 SHALL 失败并返回明确的配置错误

#### Scenario: Authenticated API request

- **WHEN** 非回环服务收到带有正确 `Authorization: Bearer <token>` 的业务请求
- **THEN** 服务 SHALL 正常进入 API 路由并保留 traceId

#### Scenario: Unauthenticated API request

- **WHEN** 非回环服务收到没有 token 或 token 不正确的业务请求
- **THEN** 服务 SHALL 返回 401、稳定 errorCode 和 traceId，且不得执行任何业务副作用

### Requirement: Health checks SHALL remain observable

健康检查和 CORS preflight SHALL 不要求 Bearer token，以便负载均衡器和浏览器完成连接探测；业务 API 仍必须认证。

#### Scenario: Anonymous liveness check

- **WHEN** 未认证调用 `/health/live`
- **THEN** 服务 SHALL 返回健康状态，不执行 Session 或工具操作
