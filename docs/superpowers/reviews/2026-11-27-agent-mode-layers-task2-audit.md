# Agent Mode Layers Task 2 Audit

## Scope

- Protocol `NexumSession` 公共响应的必有 Agent mode 类型。
- Server Session 创建请求的 mode 传递和响应。
- Client SDK Session 创建请求的 mode body 与返回值。

## Review

- [通过] HTTP 边界仍只接受 `plan` 或 `build`，非法值返回稳定参数错误。
- [通过] 公共响应类型不再把已经规范化的 mode 标记为可选。
- [通过] Session 创建 mode 由 Protocol 传入 Core，不在 Client 或页面复制默认规则。
- [通过] 已存在的 mode 更新接口保持幂等和 running 冲突语义。

## Evidence

- `packages/nexum-server/test/protocol-v1.test.ts`：6 pass，覆盖 HTTP 创建 Plan 和模式更新。
- `packages/nexum-client/test/client.test.ts`：10 pass，覆盖创建请求 body `{ mode: "plan" }`。
- Protocol、Client、Server `typecheck:tsc/typecheck` 均通过。

## Result

Task 2 满足 Protocol 层创建与返回契约，可以进入 Surface 任务。
