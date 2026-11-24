# MCP 远程 Server 生命周期

状态：现状基线

权威来源：[`packages/nexum-core/src/mcp.ts`](../../packages/nexum-core/src/mcp.ts)、[`packages/nexum-server/src/index.ts`](../../packages/nexum-server/src/index.ts)、[`packages/nexum-integrations/src/oauth.ts`](../../packages/nexum-integrations/src/oauth.ts)

## 生命周期

远程 MCP 先通过 URL 注册，再由 Runtime Registry 管理连接。状态流转为：

`disabled → pending → connected`

连接失败进入 `failed`；官方 SDK 判断需要用户授权时进入 `needs_auth`，授权完成后由调用方再次连接。断开、移除和 `runtime.close()` 都会取消当前连接操作并释放 transport，重复关闭安全。

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

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/mcp` | 列出当前 MCP Server 状态 |
| `POST` | `/mcp` | 注册远程 URL |
| `POST` | `/mcp/{id}/connect` | 发起连接 |
| `POST` | `/mcp/{id}/disconnect` | 断开连接 |
| `DELETE` | `/mcp/{id}` | 移除注册 |
| `GET` | `/mcp/{id}/tools` | 读取工具目录 |
| `GET` | `/mcp/{id}/resources` | 读取资源目录 |
| `GET` | `/mcp/{id}/prompts` | 读取 Prompt 目录 |
| `POST` | `/mcp/{id}/oauth/authorize` | 创建 OAuth 授权尝试 |
| `GET` | `/mcp/oauth/{attemptID}` | 查询授权状态 |
| `POST` | `/mcp/oauth/{attemptID}/complete` | 提交 loopback/粘贴的 redirect URL |
| `POST` | `/mcp/oauth/{attemptID}/cancel` | 取消授权尝试 |

OAuth 优先启动 `127.0.0.1` loopback callback；无浏览器回调能力时，将完整 redirect URL 提交到 `complete` 即可。授权尝试有唯一 ID、过期时间、取消和最终状态，`state` 与 PKCE verifier 绑定在这次尝试中。

## 工具桥接

连接后的 MCP 工具会注册到 Application Tool Registry，名称为 `mcp__{server_namespace}__{tool_name}`，并保留 MCP `inputSchema`。执行前经过统一 Permission，调用携带 Session ID 与取消信号；目录变化通过事件触发去抖刷新。
