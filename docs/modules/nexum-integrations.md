# `@nexum/integrations`

状态：现状基线

权威来源：[`packages/nexum-integrations/src/index.ts`](../../packages/nexum-integrations/src/index.ts)、[`packages/nexum-integrations/README.md`](../../packages/nexum-integrations/README.md)

最后核对：2026-11-24

## 职责

`@nexum/integrations` 是 Core Port 的外部系统集成层。它把 OpenAI-compatible Model、本地 Host、目录边界、项目上下文、本地 Skill 来源和 MCP Transport 接入 Core，不负责 Persistence 或 Application 业务编排。

## 公开入口

入口 [`src/index.ts`](../../packages/nexum-integrations/src/index.ts) 导出：

- `createOpenAICompatibleModelPort`：把 Chat Completions SSE/JSON 响应映射为 Core `ModelChunk`，并分类网络、认证、限流、超时和上下文错误。
- `createLocalHostAdapter`、`createLocalDirectoryValidator`：提供工作目录内的文件/命令边界。
- `createHttpMcpAdapter`、`createStdioMcpAdapter`、`createMcpAdapter`：连接 MCP Transport。
- `createNexumProjectContextPort`、`createLocalSkillSource`：提供项目上下文和本地 Skill 文件来源。

```ts
import { createLocalHostAdapter, createOpenAICompatibleModelPort } from "@nexum/integrations"

const host = createLocalHostAdapter()
const model = createOpenAICompatibleModelPort({ config: modelConfig })
```

Model 适配器只访问配置中的活动 `baseUrl`，请求凭据通过 Authorization 发送；错误摘要和日志必须脱敏。Host 适配器拒绝越出 Session 工作目录的路径。

## 端口映射与安全边界

| 集成                    | Core 端口                             | 约束                                    |
| ----------------------- | ------------------------------------- | --------------------------------------- |
| OpenAI-compatible Model | `ModelPort`                           | 流式增量、工具调用、错误分类和凭据脱敏  |
| Local Host/Directory    | `HostPort`、`NexumDirectoryValidator` | 工作目录边界和可读写校验                |
| Project Context         | `ProjectContextPort`                  | 提供项目级上下文，不拥有 Session 规则   |
| Local Skill Source      | `NexumSkillSource`                    | 发现本地 Skill 文件，不负责注册生命周期 |
| MCP                     | `McpPort`                             | 连接外部工具/资源/Prompt，不决定权限    |

权限、Skill 注册和 Runtime 组合由 Core/Application 负责，不能在 Integration 适配器中绕过这些边界。

外部适配产生的模型、工具和运行状态最终由 Server 映射到 [`apis/nexum.md`](../../apis/nexum.md)；本包不直接暴露 HTTP API。

## 依赖边界

Integrations 只依赖 Core；不能依赖 Persistence、Application、Server、Client 或 UI。它是可替换的外部系统适配器，Application 在 Runtime 创建时注入它。

## 测试与验证

该包当前没有 package-local `*.test.ts` 文件，因此直接运行 `bun test` 会得到 Bun 的 `No tests found`；不要把它当作集成测试通过信号。包级类型检查使用：

```sh
cd packages/nexum-integrations
bun run typecheck
```

当前集成行为主要由 [`packages/nexum-application/test/runtime.test.ts`](../../packages/nexum-application/test/runtime.test.ts) 通过真实 Adapter 组合验证；Core 的 Model、Host、MCP 和目录边界测试也应保持通过。新增集成测试时放入本包 `test/`，再恢复 `bun test` 作为独立验证命令。

## 修改同步清单

- 修改 Model 错误分类或流式解析：同步 [`docs/capabilities/model-runtime.md`](../capabilities/model-runtime.md)、API 错误说明和 Core/Application 测试。
- 修改目录/Host/MCP 边界：同步 [`docs/capabilities/context-and-history.md`](../capabilities/context-and-history.md)、Permission 文档和 Runtime 测试。
- 修改 Skill 来源：同步 [`docs/capabilities/skills.md`](../capabilities/skills.md) 与 Application Skill Registry 文档。
