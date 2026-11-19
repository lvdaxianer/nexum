# Design

## Context

Fork 的 `dev-v0.0.1` 基线已经将运行时拆分为 `@opencode/core`、`@opencode/server`、`@opencode/protocol`、`@opencode/client` 和 `@opencode/sdk`，同时将 App、CLI 和 TUI 放在独立包中。现有 Core 仍然包含较多数据库、Provider、MCP、PTY 和产品配置依赖，不能把整个包直接作为生产内核迁移。

本设计采用“新 Headless 包隔离、按能力迁移”的方式：第一期先建立独立进程和协议边界，再逐步将 Session、Coding Loop、Permission、Tool 和 Model Adapter 的最小实现迁移进去。原有 OpenCode 产品链路保持可用，作为行为参考和过渡适配来源。

## Goals / Non-Goals

**Goals:**

- 建立一个不依赖 App、Desktop、TUI 和 CLI 的 Headless Service 进程。
- 迁移可独立测试的最小 Session、Prompt、事件、权限和工具执行闭环。
- 让 Web POC 只通过 HTTP/SSE 驱动服务，不直接导入 Agent 内部模块。
- 为模型、存储、工具执行和权限策略建立可替换的端口边界。
- 使用实验性 Protocol/Client 类型保持服务端和客户端契约一致。
- 保留足够的事件和错误信息，支持后续审计、审批和其他 UI 接入。

**Non-Goals:**

- 不在本变更中删除或重构现有 TUI、Desktop、CLI 和完整 App。
- 不迁移全部 OpenCode Core、全部 Provider、全部 MCP、PTY 或 Worktree 能力。
- 不实现多租户、企业身份、集中策略中心、生产级沙箱或高可用部署。
- 不承诺 POC API 的长期兼容性。
- 不把模型目录、登录流程或订阅配置带入 Headless Core。

## Decisions

### 1. 新包承载迁移后的 Headless 能力

新增独立包，建议职责如下：

```text
packages/headless-core/    # Session、Agent Loop、Permission、Tool 端口
packages/headless-server/  # HTTP/SSE 服务和请求编排
packages/headless-ui/      # 最小 Solid/Vite Web POC
```

`headless-core` 只暴露领域接口和运行时事件，不依赖 `@opencode/app`、`@opencode/tui`、`@opencode/desktop` 或 `@opencode/cli`。迁移代码从现有 Core/Server 中按能力复制和改写，禁止通过深层内部路径反向依赖产品层。

备选方案是直接修改 `@opencode/core` 或仅包裹整个 `@opencode/sdk`。前者会把 POC 变成上游大范围重构，后者无法验证代码迁移后的真实边界；新包隔离可以同时保留上游同步能力和后续逐模块替换能力。

### 2. Headless Service 使用 HTTP 命令和 SSE 事件

POC 服务提供实验性接口：

```text
GET  /api/experimental/headless/health
POST /api/experimental/headless/sessions
GET  /api/experimental/headless/sessions/:id
POST /api/experimental/headless/sessions/:id/messages
POST /api/experimental/headless/sessions/:id/cancel
GET  /api/experimental/headless/sessions/:id/events
POST /api/experimental/headless/sessions/:id/permissions/:requestId
GET  /api/experimental/headless/model
PUT  /api/experimental/headless/model
```

命令接口返回确认信息或错误；执行过程通过 SSE 输出有序事件。事件至少包含 session、assistant、tool、permission、file、completed 和 failed 类型。SSE 适合 POC 的单向增量输出，审批仍通过普通 HTTP 命令完成；未来需要双向低延迟交互时可在同一协议模型上增加 WebSocket。

新增公共 Protocol/Server HttpApi 时必须从 `packages/protocol` 生成客户端类型，并执行仓库规定的 `bun run generate`，不得直接编辑生成文件。

### 3. Coding Loop 与 UI 解耦

Headless Core 的运行流程固定为：

```text
Prompt
  → Session admission
  → Model step
  → Tool request
  → Permission evaluation
  → Approval or automatic allow
  → Tool execution
  → Tool result
  → Next model step
  → Completed / Failed / Cancelled
```

Session 负责生命周期和并发状态；Agent Loop 负责模型步骤和工具结果续跑；Permission 负责决定工具是否可执行；Tool Runtime 负责实际文件和 Shell 操作。UI 只能观察事件并提交审批，不能绕过 Permission 直接执行工具。

### 4. 首期迁移范围保持最小

首期只迁移和验证：

- 一个主 Agent。
- 一个 OpenAI-compatible Model Adapter。
- `read`、`write/edit` 和 `shell` 的最小工具集合。
- `allow`、`deny`、`ask` 与 `allow_once`、`allow_always`、`deny` 审批闭环。
- Session 运行状态、取消和事件广播。

MCP、Subagent、Worktree、PTY、复杂 Provider 登录和全部插件生命周期暂时通过适配接口保留，不进入 POC 的执行路径。这样可以先证明核心边界，再按依赖图迁移更多能力。

### 5. 模型和基础设施采用端口适配

`headless-core` 依赖以下抽象，而不是依赖具体产品配置：

```text
ModelPort       # 发送模型请求并返回增量结果
ToolPort        # 描述和执行工具
PermissionPort  # 评估 action/resource 并等待审批
SessionStore    # 保存 Session 和运行状态
EventSink       # 发布有序运行事件
```

POC 默认实现可以使用内存配置和现有本地存储；模型凭据通过环境变量或内存配置注入。后续企业模型网关、权限中心、数据库和沙箱只替换 Adapter，不改变 Coding Loop。

### 6. 权限检查必须位于工具执行边界

每次工具执行都必须先生成规范化的 action/resource，再调用 PermissionPort。`ask` 状态生成唯一 requestId 并阻塞该工具；只有审批完成后才能继续。拒绝、超时、取消和重复审批都必须变成明确的工具结果或错误事件。

权限事件和日志只输出审批所需的 action、resource、命令摘要和工作目录，不输出 API Key、Authorization Header 或完整凭据。POC 不把 PermissionPort 当作沙箱；真实部署仍需要容器或受控 Worker 隔离文件、进程和网络权限。

### 7. Web POC 作为独立协议客户端

`headless-ui` 使用现有 Solid/Vite 基础设施，但只依赖生成的客户端契约或轻量 fetch 封装，不依赖 `@opencode/app`。页面只包含模型配置、工作目录、Session 对话、事件时间线和权限审批按钮，用它证明任意 UI 都可以驱动同一个 Headless Service。

## Risks / Trade-offs

- [上游 Core 依赖范围过大] → 先用依赖图确定迁移边界，禁止在 POC 中复制整个 Core；每迁移一个能力必须有独立测试。
- [OpenCode `dev` 分支变化快] → 固定 `dev-v0.0.1` 基线，记录上游提交；后续同步上游时通过适配层和集成测试发现行为变化。
- [SSE 断线导致 UI 丢事件] → POC 事件携带单调递增序号，断线后允许按 session 重新读取最近事件；不在第一期承诺完整跨进程事件回放。
- [工具执行和审批状态不一致] → PermissionPort 返回 requestId 和状态，工具执行前再次确认 pending 状态，重复审批返回冲突或幂等结果。
- [模型密钥泄露] → 配置响应和事件统一脱敏，默认从环境变量读取；集成测试检查日志和响应中不出现原始密钥。
- [权限机制被误认为安全沙箱] → 文档和运行输出明确标注 POC 边界；生产接入前必须增加执行 Worker、目录隔离和网络出口控制。
- [新增 Protocol 破坏生成客户端] → 所有公共接口先改 Protocol/HttpApi，再运行客户端生成和契约检查，不手改 generated 文件。

## Migration Plan

1. 在 `dev-v0.0.1` 的任务 worktree 中完成包边界、Protocol 和 Headless Service 骨架。
2. 先用健康接口和假的 ModelPort 验证服务独立启动，再接入真实模型。
3. 迁移 Session、事件和最小工具调用，完成不含审批的 Coding Loop。
4. 接入 PermissionPort 和审批接口，完成工具执行前阻塞/恢复测试。
5. 接入 OpenAI-compatible 模型配置和最小 Web POC。
6. 运行包级类型检查、单元测试、协议生成检查和端到端测试。
7. POC 失败时只移除新增 Headless 包和实验性接口；原有 OpenCode TUI/App/CLI 不受影响。

## Open Questions

无。SSE、单模型配置、单 Agent、内存级 POC 配置和实验性 API 已作为第一期明确决策；更强的事件回放、WebSocket、企业权限和沙箱属于后续变更。
