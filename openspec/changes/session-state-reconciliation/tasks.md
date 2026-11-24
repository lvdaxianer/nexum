# Tasks

## 1. ChatSurface 终态投影收敛

- [ ] 1.1 在 `packages/nexum-chat-surface/test/chat-projection.test.ts` 增加 completed、failed、cancelled 终态投影测试，先确认当前实现会残留 `running/streaming`。
- [ ] 1.2 在 `packages/nexum-chat-surface/src/chat-surface.tsx` 实现按 `runID` 的终态收敛，并让 `ChatSurfaceProps` 提供可选终态回调。
- [ ] 1.3 运行 `cd packages/nexum-chat-surface && bun test test/chat-projection.test.ts`，确认新增测试与原有测试通过。

## 2. 宿主 Session 列表增量同步

- [ ] 2.1 在宿主测试中增加终态事件驱动列表状态更新的失败测试，覆盖匹配 ID 更新和其他 ID 引用保持。
- [ ] 2.2 在 `packages/nexum-surfaces/src/main.tsx` 接入 ChatSurface 终态回调，按 Session ID 浅层合并状态。
- [ ] 2.3 运行宿主相关测试与 `bun typecheck`，修复类型或交互回归。

## 3. 验证与交付

- [ ] 3.1 运行 OpenSpec 验证、受影响包测试、`bun run check`，并完成代码审查与前端交互审查。
- [ ] 3.2 更新本变更任务标记，创建符合仓库规范的中文 Conventional Commit，并合并回 `dev-v0.0.1`。
