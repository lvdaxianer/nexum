# Tasks

## 1. Headless Core 消息与上下文能力

- [x] 1.1 扩展 Headless 消息模型和端口契约，支持 system/project context、Question 调用、上下文压缩结果及生命周期事件；用类型检查和新增契约测试验证 UI 无关边界
- [x] 1.2 实现可替换的上下文估算与压缩流程，覆盖阈值跳过、摘要替换、最近消息保留、压缩失败和压缩后 Function Calling 续跑；用 Core focused tests 验证消息历史和事件顺序
- [x] 1.3 实现项目 instructions/skill/reference 上下文端口，覆盖来源去重、不可读来源跳过和压缩后恢复；用 Core tests 验证同一来源不会重复注入

## 2. Headless Core 交互与安全边界

- [x] 2.1 实现 Question pending/reply/cancel 状态机并接入 Coding Loop，覆盖单题、多题、回答回传、取消和重复回答；用 Core tests 验证工具不会绕过 pending
- [x] 2.2 扩展 Function Calling 和 Permission 测试矩阵，覆盖多工具、非法参数、allow-once、allow-always、deny、取消、重复审批和凭据脱敏；用 Core 全量测试验证既有行为不回归

## 3. Headless Server 协议与集成

- [x] 3.1 增加 Question、Context Compaction 事件和状态的 Protocol/Client 类型，运行生成检查并通过 Server/Client tsc
- [x] 3.2 增加 Question 查询/回答/取消和压缩事件 SSE 集成，使用 fixture model 验证 Session → Question/Permission → Tool → Compaction → Completion 完整链路

## 4. 独立 UI 能力验收

- [x] 4.1 增加 Question 表单、压缩状态和项目上下文来源时间线，保持 UI 只通过 Headless API 交互；通过 UI tsc/build 验证
- [x] 4.2 扩展页面级 Playwright/Bun smoke，验证允许工具、拒绝工具、回答 Question、压缩后继续和凭据不出现在页面/事件中

## 5. 真实模型 Smoke 与交付

- [x] 5.1 增加安全的真实 OpenAI-compatible smoke 命令，从环境变量读取 Base URL、Model 和 API Key，覆盖无工具响应与 Function Calling 响应并禁止把凭据写入仓库
- [ ] 5.2 运行 Core/Server/UI/Protocol/Client 全量验证、OpenSpec strict validate、格式和密钥审计，更新启动/API/能力验收文档并完成最终集成

## Workflow follow-up

- 每个任务通过独立审计后提交并合并回 `dev-v0.0.1`，再创建下一个任务 worktree。
- 所有任务完成后归档 `headless-core-capability-coverage` OpenSpec 变更并验证归档后的集成分支。
