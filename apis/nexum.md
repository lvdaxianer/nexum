# Nexum Runtime API

本文是 Nexum Runtime 对外 API 的使用说明。协议模型的权威定义位于 [`packages/nexum-protocol`](../packages/nexum-protocol/README.md)，服务端装配位于 [`packages/nexum-server`](../packages/nexum-server/README.md)。

## 协议约定

| 项目 | 约定 |
| --- | --- |
| 协议版本 | `nexum.runtime.v1` |
| HTTP 前缀 | `/api/nexum` |
| 健康检查 | `/health/live`、`/health/ready` |
| 响应格式 | JSON Envelope：`data` + `meta.protocolVersion` + `meta.traceId` |
| 事件传输 | SSE；事件包含 `eventID`、`runID`、`sessionID`、`sequence` 和 `occurredAt` |

## 资源与操作

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/nexum/capabilities` | 能力发现和事件类型发现 |
| `GET` / `PUT` | `/api/nexum/model` | 读取和保存模型配置 |
| `POST` | `/api/nexum/model/probe` | 探测模型能力 |
| `GET` / `POST` | `/api/nexum/session` | 列出或创建 Session |
| `GET` / `PUT` | `/api/nexum/session/:sessionID` | 读取或更新 Session |
| `GET` | `/api/nexum/session/:sessionID/state` | 获取恢复状态 |
| `POST` | `/api/nexum/session/:sessionID/prompt` | 提交长任务 Prompt |
| `POST` | `/api/nexum/session/:sessionID/cancel` | 取消当前运行 |
| `GET` | `/api/nexum/session/:sessionID/events` | 订阅 SSE 事件流 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/permission...` | 查询和回复权限请求 |
| `GET` / `POST` | `/api/nexum/session/:sessionID/question...` | 查询、回答和取消结构化反问 |
| `GET` / `POST` | `/api/nexum/skills...` | Skill 列表、注册、刷新、校验和激活 |

## 事件语义

Core 只产生运行事实，Server 将事实编码为协议事件，应用层决定如何呈现。常用事件包括：

- `assistant.thinking`、`assistant.reasoning`、`assistant.text`：模型输出及思考状态；
- `tool.request`、`tool.result`：工具调用和工具结果；
- `permission.requested`：需要用户确认的权限请求；
- `question.request`、`question.result`、`question.cancelled`：结构化反问生命周期；
- `context.compaction.started`、`context.compaction.completed`、`context.compaction.failed`：上下文压缩；
- `skill.activated`、`skill.failed`：Skill 生命周期；
- `session.completed`、`session.failed`、`session.cancelled`：Session 终态。

因此，UI 不应通过解析模型文本来猜测是否需要反问或展示权限卡片，而应消费对应的协议事件。

## 示例

```bash
curl http://127.0.0.1:4097/api/nexum/capabilities

curl -N \
  http://127.0.0.1:4097/api/nexum/session/session_001/events
```

完整链路验证使用 [`@nexum/test`](../packages/nexum-test/README.md)：

```bash
bun run --cwd packages/nexum-test dev
```

客户端实现详见 [`@nexum/client`](../packages/nexum-client/README.md)。
