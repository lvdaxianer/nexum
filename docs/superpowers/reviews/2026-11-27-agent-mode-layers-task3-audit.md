# Agent Mode Layers Task 3 Audit

## Scope

- 新建 Session 表单的 Plan/Build 选择和创建请求。
- Session 列表、ChatSurface 标题、Composer 控制区的模式可见性。
- 模式切换的忙碌、运行中禁用、失败保留旧值和响应式布局。

## Review

- [通过] 模式标签与权限策略控件分离，颜色、文字和 aria-label 都表达了不同语义。
- [通过] 创建和切换都是成功响应后更新；请求期间防重复，失败时保留旧模式并恢复可操作状态。
- [通过] running Session 禁用切换控件，创建表单默认 Build，Plan 选择通过真实 Protocol 请求。
- [通过] Session 列表只按稳定 ID 增量合并快照，不重建无关 Session。
- [通过] 窄屏下创建模式选项退化为单列，触摸设备保留足够命中高度。

## Evidence

- `packages/nexum-surfaces/test/permission.smoke.spec.ts -t "creates a Session with the selected Agent mode"`：1 pass。
- 该场景验证 POST body 含 `{ mode: "plan" }`，Session 列表显示 `PLAN`，当前模式 aria-label 可见。
- `packages/nexum-surfaces/test/session-state.test.ts`：3 pass。
- `packages/nexum-surfaces bun run typecheck:tsc`：通过。
- `packages/nexum-surfaces bun run build`：通过。

## Result

Task 3 满足页面可见性和交互可靠性要求，可以进入文档与集成验证。
