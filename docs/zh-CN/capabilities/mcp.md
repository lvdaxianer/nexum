# MCP 远程 Server 生命周期

[English](../../capabilities/mcp.md)

状态：现状基线（2026-11-24）

权威来源：[`packages/nexum-core/src/mcp.ts`](../../../packages/nexum-core/src/mcp.ts)、[`packages/nexum-server/src/index.ts`](../../../packages/nexum-server/src/index.ts)、[`packages/nexum-integrations/src/oauth.ts`](../../../packages/nexum-integrations/src/oauth.ts)

## 生命周期

远程 MCP 先通过 URL 注册并写入 Runtime 配置存储，再由 Local Runtime 在启动恢复阶段装配 Registry、异步发起连接。Server 启动只等待配置恢复，不等待每个远程连接成功；因此 Client 可以立即读取到 `pending` 状态，并由 Runtime 继续完成连接。

连接所有权在 Runtime/Server，Client 页面只读取状态快照并发起显式控制操作，不创建 transport、不保存 OAuth token，也不实现自己的重试状态机。状态流转为：

`disabled → pending → retrying → connected`

连接失败进入有限重试：延迟依次为 `250ms → 1s → 3s`，最多调度 3 次。达到上限进入 `failed`；官方 SDK 判断需要用户授权时进入 `needs_auth`，授权完成后由调用方再次连接。`invalid_config`、`needs_auth`、主动 disconnect/close 不会自动重试。断开、移除和 `runtime.close()` 都会取消当前连接操作、清理 timer 并释放 transport，重复关闭安全。

`GET /mcp` 的安全快照可包含 `retryAttempt` 和 `nextRetryAt`，但不会返回 Authorization、Cookie、token、secret、API key 或 OAuth 凭据。Client 页面启动时读取一次列表；只要存在 `pending/retrying`，就在页面可见时每秒轮询，页面隐藏或卸载时清理轮询。

注册请求示例：

```json
{
  "id": "remote-search",
  "name": "Remote Search",
  "url": "https://example.com/mcp"
}
```

配置边界会规范化 URL，并拒绝把 `Authorization`、Cookie、token、secret 或 API key 放进公开配置。OAuth token、refresh token、client secret 只能进入 `McpCredentialStore`，不会出现在 Server 列表、目录、事件、工具结果或普通日志中。

## 实验性 HTTP API

公共前缀为 `/api/experimental/nexum`：

| 方法     | 路径                              | 作用                              |
| -------- | --------------------------------- | --------------------------------- |
| `GET`    | `/mcp`                            | 列出当前 MCP Server 状态          |
| `POST`   | `/mcp`                            | 注册远程 URL                      |
| `POST`   | `/mcp/{id}/connect`               | 发起连接                          |
| `POST`   | `/mcp/{id}/disconnect`            | 断开连接                          |
| `DELETE` | `/mcp/{id}`                       | 移除注册                          |
| `GET`    | `/mcp/{id}/tools`                 | 读取工具目录                      |
| `GET`    | `/mcp/{id}/resources`             | 读取资源目录                      |
| `GET`    | `/mcp/{id}/prompts`               | 读取 Prompt 目录                  |
| `POST`   | `/mcp/{id}/oauth/authorize`       | 创建 OAuth 授权尝试               |
| `GET`    | `/mcp/oauth/{attemptID}`          | 查询授权状态                      |
| `POST`   | `/mcp/oauth/{attemptID}/complete` | 提交 loopback/粘贴的 redirect URL |
| `POST`   | `/mcp/oauth/{attemptID}/cancel`   | 取消授权尝试                      |

OAuth 优先启动 `127.0.0.1` loopback callback；无浏览器回调能力时，将完整 redirect URL 提交到 `complete` 即可。授权尝试有唯一 ID、过期时间、取消和最终状态，`state` 与 PKCE verifier 绑定在这次尝试中。

授权完成后由 Runtime OAuth manager 写入 `McpCredentialStore`，再触发目标 MCP 重新连接；授权流程不进入自动重试计数。Client 只打开授权 URL，并通过状态列表观察连接是否恢复。

## 工具桥接

连接后的 MCP 工具会注册到 Application Tool Registry，名称为 `mcp__{server_namespace}__{tool_name}`，并保留 MCP `inputSchema`。执行前经过统一 Permission，调用携带 Session ID 与取消信号；目录变化通过事件触发去抖刷新。
