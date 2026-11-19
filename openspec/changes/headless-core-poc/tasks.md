# Tasks

## 1. Headless 包边界与服务骨架

- [x] 1.1 新增 `headless-core` 包及 `ModelPort`、`ToolPort`、`PermissionPort`、`SessionStore`、`EventSink` 最小契约，验证其运行时依赖不包含 `@opencode/app`、`@opencode/tui`、`@opencode/desktop` 或 `@opencode/cli`
- [x] 1.2 新增 `headless-server` 包并实现独立启动入口和健康检查接口，验证 Headless Service 可以在不启动 TUI/Desktop 的情况下启动并返回健康状态
- [x] 1.3 为 Headless Session、事件和权限请求增加实验性 Protocol/HttpApi 类型，运行 `bun run generate`（从 `packages/client`）并验证生成客户端与服务端类型检查通过

## 2. Session 与 Coding Loop 迁移

- [x] 2.1 迁移最小 Session 创建、工作目录校验和状态管理，验证有效目录可创建 Session、无效目录被拒绝
- [x] 2.2 迁移单 Agent Prompt 执行和模型步骤续跑，验证模型输出、工具请求、工具结果和完成事件形成有序 Coding Loop
- [x] 2.3 增加 Session 取消和失败处理，验证取消、模型错误和工具错误都能产生终态事件且不会继续执行后续工具

## 3. 工具权限审批闭环

- [x] 3.1 迁移最小 `read`、`write/edit`、`shell` 工具注册和 action/resource 归一化，验证每次工具执行前都会经过 PermissionPort
- [x] 3.2 实现 `allow_once`、`allow_always`、`deny` 的审批接口和 pending request 状态，验证未审批时工具暂停、允许后继续、拒绝后不执行
- [x] 3.3 增加重复审批、未知 request、取消审批和敏感字段脱敏测试，验证重复请求不会导致重复执行且事件/日志不包含凭据

## 4. 最小模型运行时配置

- [x] 4.1 实现单一 OpenAI-compatible Base URL、模型名称和凭据引用配置，验证非法 URL/模型配置被拒绝并保留上一次有效配置
- [ ] 4.2 将活动模型配置接入新 Session 的 ModelPort，验证模型不可达或认证失败时产生安全错误且不自动切换 Provider
- [ ] 4.3 增加配置读取和错误日志的密钥脱敏测试，验证 API Key 不出现在响应、事件、错误和普通日志中

## 5. 独立 Web POC

- [ ] 5.1 新增不依赖完整 `packages/app` 的最小 Solid/Vite Web 客户端，验证页面只通过 Headless API 创建 Session、发送 Prompt 和订阅事件
- [ ] 5.2 增加模型配置、工作目录、事件时间线和权限审批交互，验证页面能完成一次允许工具执行的 Coding Task
- [ ] 5.3 增加页面级冒烟测试或 Playwright 测试，验证拒绝权限时任务显示失败/拒绝状态且页面不会直接执行本地工具

## 6. POC 集成验证与交付文档

- [ ] 6.1 增加端到端 Fixture 项目和 Headless Service 集成测试，验证创建 Session → Prompt → Permission → Tool → Completion 的完整链路
- [ ] 6.2 运行受影响包的 `bun typecheck`、`bun run typecheck:tsc`、单元测试、协议生成检查和 Headless UI 构建，记录基线与结果
- [ ] 6.3 编写 Headless Service 启动、API 示例、模型配置和 POC 安全边界文档，验证新开发者可按文档启动服务并完成一次任务

## Workflow follow-up

- 在所有任务通过测试、审计和提交后归档 `headless-core-poc` OpenSpec 变更。
- 在 `dev-v0.0.1` 集成分支上确认所有任务分支已合并，并验证最终集成分支包含完整 POC。
