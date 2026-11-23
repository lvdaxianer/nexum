# Tasks

## 1. 协议与服务端历史读取

- [ ] 1.1 在 `packages/nexum-protocol/src/index.ts` 定义安全的 `NexumMessage` 联合类型和分页响应类型，覆盖 system、user、assistant、tool 消息及 `index`、`total`、`hasMore`、`nextBefore` 字段，并为类型形状补充 Protocol 测试。
- [ ] 1.2 在 `packages/nexum-server/test/server.test.ts` 增加消息历史接口的 RED 测试，覆盖最新一页、`before` 游标、工具调用与压缩摘要、未知 Session、非法分页参数和凭据脱敏；运行 `cd packages/nexum-server && bun test test/server.test.ts` 确认新增测试先失败。
- [ ] 1.3 在 `packages/nexum-server/src/index.ts` 实现实验性分页消息接口，读取注入的 `MessageStore`，校验 Session 与分页边界，对返回消息做安全投影和凭据脱敏；运行同一 Server 测试文件确认新增测试通过。
- [ ] 1.4 更新 `apis/` 中对应的 Nexum Session 模块文档，记录方法、完整 URL、query 参数、响应结构、错误响应和 curl 示例，并运行文档自检确认字段与实现一致。

## 2. 客户端与事件恢复游标

- [ ] 2.1 在 `packages/nexum-client/src/index.ts` 增加分页消息查询方法和 `afterSequence` 事件订阅选项，在 `packages/nexum-client` 的类型检查中确认调用方可以获得完整类型。
- [ ] 2.2 在 `packages/nexum-server/test/events.test.ts` 增加按 sequence 恢复 SSE 的 RED 测试，确认服务端不会回放游标之前的事件；运行 `cd packages/nexum-server && bun test test/events.test.ts` 观察预期失败。
- [ ] 2.3 修改 `packages/nexum-server/src/index.ts` 与事件订阅调用，解析并传递合法 `afterSequence`，保留 `Last-Event-ID` 的已有行为；运行 `cd packages/nexum-server && bun test test/events.test.ts test/server.test.ts` 确认通过。

## 3. 页面历史加载与滚动

- [ ] 3.1 在 `packages/nexum-surfaces/test/permission.smoke.spec.ts` 增加历史恢复、向上分页、加载失败保留当前内容和 SSE 游标恢复的 RED 场景，确认当前页面没有历史消息接口时测试失败。
- [ ] 3.2 在 `packages/nexum-surfaces/src/main.tsx` 接入消息分页查询：选择 Session 时加载最新页，建立带 `lastSequence` 的事件订阅，历史页插入顶部并保持滚动锚点，处理 loading/error/retry 状态和过期 Session 响应。
- [ ] 3.3 将 canonical 消息映射到现有 `ChatItem`，让工具调用、工具结果、reasoning、Assistant 文本和压缩摘要在对话页可读；保持事件页独立并验证 Smoke 测试通过。
- [ ] 3.4 在 `packages/nexum-surfaces/src/styles.css` 补充历史加载状态、顶部加载提示和可访问的空/失败状态样式；运行 `cd packages/nexum-surfaces && bun run typecheck:tsc && bun run build` 确认构建通过。

## 4. 集成验证与交付

- [ ] 4.1 运行 `openspec validate --change context-history-replay --strict`，修复规格、任务和 API 文档的一致性问题，并确认所有任务描述都有可执行验证方式。
- [ ] 4.2 在任务 worktree 运行 `bun run check`，再运行 `cd packages/nexum-core && bun test test/context-compaction.test.ts test/message-store.test.ts`、`cd packages/nexum-server && bun test test/events.test.ts test/server.test.ts` 和 `cd packages/nexum-surfaces && bun run build`。
- [ ] 4.3 启动本地前后端并用浏览器验证：刷新已有 Session 后能看到历史对话，向上滚动加载早期消息，运行新 Prompt 时只追加实时消息，事件视图仍可查看事件窗口。

## Workflow follow-up

- 完成代码审查、计划一致性审计和每项任务审计后，更新任务勾选状态并提交符合项目规范的 commit。
- 将任务分支合并回 `dev-v0.0.1`，验证合并祖先关系后清理 worktree。
- 归档 OpenSpec change，并核对归档后的正式规格与实现一致。
