# 外部集成能力

状态：现状基线

权威来源：`packages/nexum-integrations/src/index.ts` 及其适配器实现、`packages/nexum-application/src/index.ts`

最后核对：2026-11-24

## 1. 边界

`nexum-integrations` 只把外部系统映射到 Core Port，不定义 Session、Permission 或 UI 业务规则。Application 负责选择默认适配器并注入 Runtime；Server 和 Surface 只能通过 Application/Protocol 使用这些能力。

| 适配器     | Core Port                 | 当前实现                              |
| ---------- | ------------------------- | ------------------------------------- |
| 工作目录   | `NexumDirectoryValidator` | 检查绝对目录存在、类型和读写权限      |
| 本地 Host  | `HostPort`                | 工作目录内读、写、编辑、shell         |
| 模型       | `ModelPort`               | OpenAI-compatible `/chat/completions` |
| Skill 来源 | `NexumSkillSource`        | 本地 Skill 目录扫描和读取             |
| 项目上下文 | `ProjectContextPort`      | 从配置的本地文件读取上下文            |
| MCP        | `McpPort`                 | JSON-RPC tools/resources/prompts/call |

## 2. 本地文件与 Host

工作目录校验由 `createLocalDirectoryValidator()` 提供，Core 只保留路径语义。Host Adapter 将资源解析到 Session 工作目录内；目录外路径返回失败，不通过路径拼接绕过边界。Shell 默认使用 `sh`，可通过 `LocalHostOptions.shell` 替换。

Skill Source 将 roots 规范化为绝对路径，拒绝符号链接和不安全相对路径；详情见 [Skill 能力](skills.md)。Project Context Source 只返回成功读取的配置项，并按 `sourceID` 去重。

## 3. 模型与凭据边界

OpenAI-compatible Adapter 从 `NexumModelConfigStore` 读取配置和凭据，向上游发送 `Authorization: Bearer ...`，但不会把凭据返回到 Protocol、事件、历史或错误详情。响应错误只保留有限、脱敏的摘要和可选 provider code/retry-after 信息。

模型适配器依赖标准 `fetch` 端口，因此测试可以注入实现，不需要真实网络。流式 SSE 和非流式 JSON 都归一化成 Core 的 `ModelChunk`。

## 4. MCP

MCP Adapter 需要宿主提供一个 `McpRpcTransport`，统一调用 `tools/list`、`resources/list`、`prompts/list` 和 `tools/call`。HTTP、stdio、桌面 IPC 或企业网关可以复用同一 RPC 映射；当前三个工厂共享相同的协议转换逻辑。Server/Surface 是否展示 MCP 能力由 Runtime capabilities 决定。

## 5. 替换规则

替换外部集成时保持 Core Port 契约：

- 错误转换为稳定领域错误，不把 SDK、绝对路径或凭据类型泄漏到 Protocol。
- 取消使用传入的 `AbortSignal` 或对应端口的取消能力。
- 只返回允许进入事件、状态和页面的安全字段。
- 新增集成不要让 Core 直接依赖 Node、网络 SDK 或 UI 包。

## 6. 相关入口

- [模块边界](../architecture/module-boundaries.md)
- [模型运行时](model-runtime.md)
- [Skill 能力](skills.md)
- [Application Runtime 组合](../../packages/nexum-application/src/index.ts)
- [Application 集成测试](../../packages/nexum-application/test/runtime.test.ts)
