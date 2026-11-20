# Headless Protocol v1 Tasks

## 1. 协议契约与恢复接口

- [x] 1.1 在 `packages/protocol` 增加 v1 协议版本、统一响应元数据、能力发现和会话状态快照 Schema，并补充协议 Schema 测试；验证：`bun test --cwd packages/protocol`
- [x] 1.2 在 `packages/headless-server` 统一成功/错误 Envelope，增加能力发现和状态快照路由，保持错误脱敏；验证：`bun test --cwd packages/headless-server test/protocol-v1.test.ts`
- [x] 1.3 重新生成 Promise/Effect 客户端并检查生成物；验证：`bun run --cwd packages/client generate && bun run --cwd packages/protocol generate`，生成后客户端回归测试通过

## 2. 运行事件与断线恢复

- [x] 2.1 为 Core 运行事件增加 `eventID`、`runID`、`occurredAt`，并保证同一会话跨 Prompt 的序列单调递增；验证：`bun test --cwd packages/headless-core test/runtime-event.test.ts`
- [x] 2.2 为 Event Hub 增加有限历史、`Last-Event-ID` 重放和 `permission.requested` 事件；验证：`bun test --cwd packages/headless-server test/protocol-v1.test.ts`
- [x] 2.3 更新 SSE 输出与事件客户端测试；验证：`bun test --cwd packages/client test/headless-generated.test.ts test/contract-identity.test.ts`

## 3. 文档与交付

- [x] 3.1 将 `apis/headless.md` 更新为中文 Headless Protocol v1 协议文档，覆盖接口、消息格式、错误、SSE、恢复和安全约束；验证：文档示例与 Schema/路由逐项核对
- [x] 3.2 提交设计文档 `docs/superpowers/specs/2026-11-20-headless-protocol-v1-design.md` 并完成 OpenSpec 严格校验；验证：`bunx openspec validate headless-protocol-v1 --strict`
- [x] 3.3 运行核心、服务端、协议、客户端和 UI 回归测试，完成 diff、敏感信息和日志边界审计；验证：核心 `52 pass`、服务端 `22 pass`、协议 `19 pass`、客户端 `4 pass`、UI smoke `6 pass`

## 4. 收尾

- [x] 4.1 请求代码审查并修复 P0/P1 问题；验证：完成提交前自审，未发现 P0/P1；核心、服务端、协议、客户端和 UI 回归测试均通过
- [ ] 4.2 将任务分支以 `--no-ff` 合并回 `dev-v0.0.1`，清理 worktree 并验证主工作区干净；验证：`git status --short --branch`
