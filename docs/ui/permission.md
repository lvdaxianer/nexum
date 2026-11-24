# Permission 权限协议

状态：现状基线

权威来源：`packages/nexum-protocol/src/index.ts`、`packages/nexum-core/src/permission.ts`、`packages/nexum-core/src/permission-policy.ts`、`packages/nexum-server/src/index.ts`、`packages/nexum-chat-surface/src/chat-surface.tsx`

最后核对：2026-11-24

## 1. 用途和决策边界

Permission 是工具动作在执行前需要用户或策略决定时产生的 Runtime 交互。Core 的 Permission Broker 先评估策略；只有未命中允许/拒绝规则时才创建 pending 请求并阻塞等待。UI 只展示和提交决定，不执行工具、不直接改内存 Broker，也不绕过危险操作规则。

待审批请求结构：

| 字段        | 类型         | 说明                                    |
| ----------- | ------------ | --------------------------------------- |
| `id`        | string       | 权限请求 ID                             |
| `sessionID` | string       | 所属 Session                            |
| `action`    | string       | 工具动作，例如 `shell`、`read`、`write` |
| `resource`  | string       | 资源或命令；服务端边界已做脱敏          |
| `reason`    | string，可选 | 给用户看的审批原因                      |

## 2. 三种用户决定

| 决定           | 本次调用         | 后续影响                                            |
| -------------- | ---------------- | --------------------------------------------------- |
| `allow_once`   | 允许当前工具请求 | 不创建持久化的永久允许规则                          |
| `allow_always` | 允许当前工具请求 | 记录精确资源的全局 `allow` 策略，后续匹配可直接放行 |
| `deny`         | 拒绝当前工具请求 | 当前工具调用失败/拒绝，Runtime 按错误路径处理       |

“始终允许”通过策略层保存 `action="*"` 的全局资源规则，表示按资源匹配所有工具；它不是 UI 本地开关。危险 shell 或路径请求仍要求精确资源匹配，不能通过宽泛通配规则无条件放行。

## 3. UI 交互

1. 收到 `permission.requested` 或 state pending 权限后展示动作、资源和原因。
2. 三个决定按钮在请求提交期间全部禁用，同一请求只能有一个处理中动作。
3. 成功后移除请求卡片，显示允许/拒绝结果，并等待工具结果或运行终态。
4. 失败时保留安全的错误提示和 traceId，允许用户在请求仍 pending 时重试。
5. Session 切换或刷新时通过 state 重新加载；不能把旧 Session 的权限请求展示到新 Session。

参考 Surface 的权限模式：

- `ask`：工具调用默认逐次询问；
- `balanced`：常规操作由策略放行，风险资源仍询问；
- `full`：策略尽量放行，但危险操作仍由 Core 规则拦截询问。

模式是宿主控制面配置，不改变 Permission reply 的三个协议决定。

## 4. Permission API

### 4.1 查询待审批请求

```http
GET /api/nexum/session/{sessionID}/permission
```

成功响应的 `data` 是权限请求数组。请求没有 body、query 参数、Cookie；当前 Server 未校验认证 Header。Permission Broker 未配置时返回 `503 NEXUM_PERMISSION_NOT_CONFIGURED`；Session 不存在时返回 `404 NEXUM_SESSION_NOT_FOUND`。

### 4.2 回复审批

```http
POST /api/nexum/session/{sessionID}/permission/{requestID}/reply
Content-Type: application/json

{"decision":"allow_once"}
```

成功响应：

```json
{
  "data": { "status": "approved" },
  "meta": { "protocolVersion": "nexum.runtime.v1", "traceId": "trace_permission_001" }
}
```

`deny` 的响应 `data.status` 为 `denied`。服务端只接受 `allow_once`、`allow_always` 和 `deny`；未知决定返回 `400 NEXUM_INVALID_REQUEST`。其他错误：

| HTTP  | `errorCode`                         | 条件                 | UI 处理                        |
| ----- | ----------------------------------- | -------------------- | ------------------------------ |
| `404` | `NEXUM_SESSION_NOT_FOUND`           | Session 不存在       | 清除当前 Session 选择并刷新    |
| `404` | `NEXUM_PERMISSION_NOT_FOUND`        | 请求不存在或已处理   | 移除旧卡片并刷新 pending       |
| `409` | `NEXUM_PERMISSION_SESSION_MISMATCH` | 请求属于其他 Session | 丢弃旧请求，不重试同一 Session |
| `400` | `NEXUM_INVALID_REQUEST`             | decision 缺失或非法  | 修正协议值后重试               |
| `500` | `NEXUM_PERMISSION_REPLY_FAILED`     | Broker/Store 失败    | 保留上下文并带 traceId 排障    |
| `503` | `NEXUM_PERMISSION_NOT_CONFIGURED`   | 没有配置 Broker      | 提示 Runtime 配置缺失          |

### 4.3 权限策略管理

策略管理端点由宿主控制面使用，不等同于一次权限回复：

| 方法     | 路径                                         | 用途                                  |
| -------- | -------------------------------------------- | ------------------------------------- |
| `GET`    | `/api/nexum/permission/policy?sessionID=...` | 查询全局或 Session 规则               |
| `POST`   | `/api/nexum/permission/policy`               | 新增规则                              |
| `PUT`    | `/api/nexum/permission/policy/{ruleID}`      | 修改 `action`、`resource` 或 `effect` |
| `DELETE` | `/api/nexum/permission/policy/{ruleID}`      | 删除规则                              |

规则字段：`action` 支持 `shell`、`read`、`write`、`edit` 或 `*`；`resource` 是匹配模式；`effect` 是 `allow`、`ask` 或 `deny`；`scope` 是 `global` 或 `session`；Session 规则必须提供有效 `sessionID`。策略优先处理拒绝，Session 规则覆盖全局规则，危险资源的允许规则必须精确匹配。

## 5. 事件、持久化和重启

Permission 请求产生时发送 `permission.requested`。回复会改变等待中的 Broker 结果并继续工具流程；最终工具和运行状态通过后续事件表达。UI 使用 request ID 去重和更新卡片。

配置 Interaction Store 时只持久化可展示的权限摘要，并在写入前脱敏 resource/reason。重启后 pending 记录标记为 `orphaned`，不会出现在可回复的 pending 列表；回复旧 ID 只能得到 Not Found，不得假装成功。

## 6. 相关文档

- [UI 交互协议](interaction-protocol.md)
- [UI 状态与操作可靠性](states.md)
- [Runtime API](../../apis/nexum.md)
- [Runtime 运行流程](../architecture/runtime-flow.md)
