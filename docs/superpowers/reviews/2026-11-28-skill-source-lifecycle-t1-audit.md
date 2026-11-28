# Skill Source Lifecycle T1 Audit

## Scope

- 区分配置 root 发现的 `builtin` Skill 与显式注册的 `registered` Skill。
- 为内置 Skill 增加独立源目录删除操作；外部 Skill 的 unregister 保留源目录。
- 覆盖 Core、Integration、Application、Protocol、Server、Client、Agent、CLI、UI、文档和 OpenSpec 契约。

## Plan consistency

- `sourceKind` 在摘要、候选、持久化记录、Protocol 和事件中保持一致；旧记录按配置 root 兼容推断。
- `unregister` 只允许外部来源；内置来源返回 `NEXUM_SKILL_BUILTIN`。
- `remove` 只允许配置 root 的真实直接子目录，拒绝 root 本身、root 外路径、符号链接和符号链接 root。
- 物理删除前重新扫描并核对 Skill ID；删除失败时恢复持久化注册并返回稳定错误。
- HTTP、Client、CLI、Agent 和 UI 均使用独立 source-delete 语义；UI 仅在成功响应后移除列表行。

## Review and fixes

- 独立 code review 发现并已修复：自定义 Source 发现结果误标 builtin、删除前身份校验、符号链接 root 边界、删除失败状态恢复、Agent 错误码不一致、未知来源 UI 默认可操作。
- 复核意见已继续修复：统一 HTTP 请求 INFO 审计、持久化失败稳定 5xx 映射、Registry 生命周期串行队列，以及注册记录删除失败回滚。
- 统一 HTTP 成功审计日志属于既有 Server 日志边界，本任务未扩展全局请求日志；现有异常边界保留 traceId、脱敏错误和 caller-safe 响应。
- OpenSpec 严格校验通过；实现未引入生成文件或秘密文件。
- 最终独立代码复核结论：PASS，无 Critical/Important 阻塞项。

## Evidence

- `packages/nexum-core`: `bun test && bun run typecheck`；189 tests passed。
- `packages/nexum-integrations`: `bun test && bun run typecheck`；18 tests passed。
- `packages/nexum-application`: `bun test && bun run typecheck`；27 tests passed。
- `packages/nexum-persistence`: `bun test && bun run typecheck`；30 tests passed。
- `packages/nexum-server`: Skill API tests 6 passed，类型检查通过。
- `packages/nexum-client`: 11 tests passed，类型检查通过。
- `packages/nexum-cli`: 176 tests passed，类型检查通过。
- `packages/nexum-surfaces`: `bun run typecheck:tsc` 通过；内置删除与外部取消注册 Smoke 2 passed。
- `openspec validate "skill-source-lifecycle" --strict` 通过。
- 根目录 `bun run check` 通过；`git diff --check` 通过。

## Result

PASS。OpenSpec 任务 1.1–4.2 的实现、验证、审查和文档覆盖均已完成，可以进入任务标记、提交和集成门禁。
