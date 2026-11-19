# Design

## Context

详见 `proposal.md`。当前 Headless Core 已有 `ModelMessage`、多工具 Function Calling、Permission Broker、内存 Session 和 SSE EventHub，但没有上下文压缩、Question 交互或项目上下文来源的独立端口。现有 OpenCode Core 的对应参考行为位于 `packages/core/src/session/compaction.ts`、`packages/core/src/tool/plugin/question.ts` 和 `packages/core/src/session/context.ts`；Headless POC 只迁移可验证的行为边界，不反向依赖产品层。

## Goals / Non-Goals

**Goals:**

- 在 `headless-core` 中提供可替换的压缩、问题收集和项目上下文端口。
- 让压缩、问题、权限和工具结果都能形成稳定的 ModelMessage 历史，并通过 SSE 观察。
- 让 Server API 和独立 UI 可以完成等待、回答、拒绝、取消和继续运行。
- 用纯 fixture 测试确定行为，再用真实 OpenAI-compatible endpoint 做不含凭据的可选 smoke。

**Non-Goals:**

- 不复制完整 OpenCode Core 的 Effect、数据库、Provider、MCP、PTY、Subagent 或 Worktree 实现。
- 不在本变更中实现生产级 tokenizer；默认使用注入的估算端口，测试使用可预测的字符/消息计数。
- 不让 UI 直接读取文件、执行 Shell 或调用模型；所有副作用仍由 Headless Server 和 Core 端口负责。

## Decisions

### 1. 以端口隔离压缩、问题和项目上下文

新增三个最小可替换端口：

- `ContextCompactionPort`：接收当前消息和保留策略，返回摘要、保留消息及来源元数据。
- `QuestionPort`：创建 pending question、查询、回答和取消，并将回答转换为 `ToolResult`。
- `ProjectContextPort`：按 Session 和来源 ID 加载 instructions/skill/reference，返回可注入的 system/context message。

选择端口而不是直接引入 OpenCode Core，是为了让 fixture 可以确定地控制阈值、摘要和答案，同时保留生产环境替换为真实摘要器、文件发现器或集中交互服务的能力。

### 2. 保持统一消息历史

在现有 `ModelMessage` 中增加 system/context 消息和问题工具调用的表达；所有新增能力都必须最终落入同一条消息历史：

```text
system/project context
→ user
→ assistant tool call
→ question/tool result or permission-approved tool result
→ compaction summary + recent messages
→ assistant final/tool call
```

这样 Function Calling、Question 和压缩可以组合测试，不需要为每种交互维护第二套 prompt 状态。

### 3. 压缩发生在模型请求边界

Coding Loop 在每次调用 ModelPort 前调用估算端口；达到阈值时先发布 started 事件、执行压缩，再发送压缩后的完整消息。压缩失败时不发送半截历史，也不执行后续工具。摘要保留项目上下文标识和最近消息；被裁剪的项目来源由 `ProjectContextPort` 根据来源 ID 重新注入。

备选方案是只在 UI 侧显示“已压缩”，但这不能证明模型实际收到压缩后的历史，因此不采用。

### 4. Question 使用与 Tool 相同的暂停/续跑语义

Question 由模型以结构化调用提出，Core 发布 `question.request` 并暂停；UI 通过普通 HTTP 查询和回复，EventHub 发布 result；Core 将答案作为带原调用 ID 的 tool message 回传模型。取消不会伪造答案，且不会继续执行依赖答案的工具。

备选方案是新增独立的聊天输入通道；该方案会产生两套并发和历史语义，因此不采用。

### 5. 事件和 API 保持实验性、可审计

新增事件使用稳定前缀 `context.compaction.*` 和 `question.*`，事件数据只包含 request ID、来源摘要、状态和安全错误。Server 提供 Session 范围的 pending/list/reply/cancel 接口，UI 只调用这些接口。所有响应、事件和日志继续复用现有脱敏边界。

### 6. 分层测试

测试分为三层：

1. Core：消息历史、端口状态机、压缩和去重的确定性测试。
2. Server：SSE、Question/Permission HTTP、Function Calling 与压缩组合的 fixture 集成测试。
3. UI：配置、事件时间线、权限和 Question 交互的页面级测试；真实模型 smoke 只在环境变量存在时执行，不把凭据作为 fixture。

## Risks / Trade-offs

- [摘要质量依赖模型] → POC 将摘要器作为端口，fixture 验证消息边界；真实模型 smoke 只验证协议和续跑，不把摘要质量伪装成确定性指标。
- [压缩与工具调用交错导致历史错乱] → 每次模型请求前统一生成不可变消息快照，并测试多工具、Question、压缩组合。
- [Question pending 永久阻塞] → 保存 request ID 和 Session 状态，提供取消接口、重复回复冲突错误和 Session cancel 清理。
- [项目上下文泄露敏感文件] → ProjectContextPort 只接收已授权来源，事件只输出来源摘要；读取失败不生成伪造内容。
- [公开 API 变更影响生成客户端] → 先修改 Protocol/HttpApi，再执行生成检查和服务端/客户端 tsc。

## Migration Plan

1. 先为新端口、消息类型和事件建立 RED 测试，再实现 Core 状态机。
2. 接入 Server API 和默认 Runtime，保留现有 Function Calling/Permission 行为兼容。
3. 接入 UI Question、压缩状态和项目上下文可视化，再运行页面测试。
4. 运行 Core/Server/UI/Protocol/Client 全量门禁和 fixture 联调。
5. 以旧 Headless Runtime 作为回滚路径；若新端口失败，默认关闭压缩和 Question，不影响原有工具审批链路。

## Open Questions

无。规格已将“补充信息”定义为 Question Tool 加项目上下文注入；更完整的 MCP/Subagent/PTY 能力另立变更。
