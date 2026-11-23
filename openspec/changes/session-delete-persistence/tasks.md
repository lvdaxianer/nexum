# Tasks

## 1. Core 与持久化 Store 清理

- [x] 1.1 在 `packages/nexum-core` 的 SessionStore、MessageStore、InteractionStore 契约和 `packages/nexum-adapters` 的内存/文件实现中增加按 Session 删除能力；先为 settled Session 删除、无关 Session 保留、文件重建后不恢复和 running 状态拒绝编写失败测试，再实现最小逻辑，验证 `bun test` 的相关 Core/Adapter 测试通过。
- [x] 1.2 为 EventHub 增加按 Session 删除回放历史的能力，并覆盖内存和文件 Store 的原子写入与重启验证；验证 `bun test`（`packages/nexum-server` 的 `events.test.ts`）通过。

## 2. Server、Client 与 API 契约

- [ ] 2.1 在 `packages/nexum-server` 增加 `DELETE /api/nexum/session/:sessionID`，按“消息→交互→事件→Session 元数据”顺序清理，映射 404/409/500 稳定错误；先写 Server API RED 测试，再实现并验证成功、未知、running、重复删除、历史清理和工作目录保留场景。
- [ ] 2.2 在 `packages/nexum-client` 与 `packages/nexum-protocol` 增加 `session.delete` 类型和调用方法；先写客户端请求契约测试，再验证 DELETE path、Envelope 和稳定错误解析。
- [ ] 2.3 更新 `apis/nexum.md` 的 Session 资源表和删除端点章节，包含参数、请求头、响应、错误、幂等语义和可运行 curl；验证文档与 Server 测试中的实际路径/字段一致。

## 3. Web Surface 删除交互

- [ ] 3.1 在 `packages/nexum-surfaces/src/main.tsx` 复用现有 `ConfirmDialog` 添加危险删除入口、pending/失败/成功状态和当前 Session 切换；验证未确认不发请求、确认按钮防重复、删除后事件流关闭和空态/下一个 Session 正确。
- [ ] 3.2 在 `packages/nexum-surfaces/test/permission.smoke.spec.ts` 增加删除 Session 的 Playwright smoke 覆盖，并运行前端类型检查、构建和该 smoke 测试。

## 4. 集成验证

- [ ] 4.1 运行受影响包的聚焦测试、`bun run --cwd packages/nexum-surfaces typecheck:tsc`、`bun run --cwd packages/nexum-surfaces build`、相关 smoke、`openspec validate session-delete-persistence --strict` 和 `git diff --check`，确认模型配置持久化、Session 持久化和删除边界均有证据。

## Workflow follow-up

- 完成每个任务的 TDD、代码审查、后端可靠性/前端交互审计和 per-task audit 后，立即标记对应复选框并提交原子变更。
- 全部任务完成后执行最终 OpenSpec 验证与归档，并将任务分支合并回 `dev-v0.0.1`。
