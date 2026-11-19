# Proposal

## Why

当前 Headless POC 已证明基础 Session、工具调用、权限审批和 UI 事件链路可运行，但尚未证明 OpenCode 核心运行时最关键的四类行为能够在长任务中稳定续跑：Function Calling、上下文压缩、权限控制和向用户补充信息。没有这些可重复的测试，真实模型接入成功也不能说明迁移后的 Core 具备生产所需的行为边界。

本变更将把这四类能力变成明确的 Headless 领域契约、fixture 模型场景、Server 集成测试和 UI 级验收，并保留真实 OpenAI-compatible 模型的安全 smoke 入口。

## What Changes

- 为 Headless Core 增加可观察、可替换的上下文压缩能力：按阈值生成摘要、保留最近消息、继续后续模型步骤，并发布压缩生命周期事件。
- 为 Headless Core 增加 `question` 补充信息能力：模型提问、UI 查询 pending question、用户回答、回答作为工具结果回传模型。
- 扩展 Function Calling 测试矩阵，覆盖多工具调用、参数错误、工具失败、压缩后续跑和最终完成。
- 扩展权限测试矩阵，覆盖 allow-once、allow-always、deny、取消、重复审批、敏感信息脱敏及 UI 不绕过权限边界。
- 增加项目上下文补充测试，验证 instructions/skill/reference 等上下文只注入一次，并在压缩后仍可恢复。
- 增加 Server SSE/HTTP 和独立 UI 的完整 fixture 联调测试。
- 增加不包含真实凭据的真实模型 smoke 命令；凭据只能通过进程环境或运行时输入注入。

## Capabilities

### New Capabilities

- `headless-function-calling`: 定义模型工具声明、单轮多工具调用、工具结果续跑和失败边界。
- `headless-context-compaction`: 定义上下文阈值、摘要替换、最近消息保留、压缩事件和压缩后续跑。
- `headless-permission-approval`: 定义工具执行前审批、审批状态、取消和脱敏边界。
- `headless-question-collection`: 定义模型向 UI 请求补充信息、用户回答和模型继续执行。
- `headless-project-context`: 定义项目 instructions、skill/reference 等补充上下文的注入、去重和压缩恢复。

### Modified Capabilities

- 无。此前 Headless POC 的规格仍位于未归档变更中，本变更建立可独立验收的能力规格。

## Impact

- 影响 `packages/headless-core` 的 ModelMessage、Coding Loop、Tool/Permission 端口和 Runtime 事件。
- 影响 `packages/headless-server` 的 SSE 事件、Permission API、Question API 和运行时组合入口。
- 影响 `packages/headless-ui` 的时间线、权限队列、Question 交互和压缩状态展示。
- 新增 Core/Server/Browser fixture 测试和 OpenSpec 能力规格；不修改完整 App、TUI、Desktop 或 CLI。
- 真实模型 smoke 只读取环境变量，不把 API Key 写入仓库、日志、事件或测试快照。
