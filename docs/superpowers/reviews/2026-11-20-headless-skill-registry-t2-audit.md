# T2 Per-task Audit

## Scope

- 任务边界：Core `@skill` mention 解析、Registry 内容注入、`skill.use` 权限、激活/失败事件和取消语义。
- 未触及：Headless Server/API、生成客户端、Headless UI、Skill 脚本执行器。
- 直接执行 fallback：Skill resolver 与 Coding Loop 共享 `packages/headless-core/src/index.ts` 的 Prompt/取消边界，拆分 agent 会造成同一运行链路的重叠写入；由主 agent 保持 RED/GREEN 证据。

## Evidence

- RED：`bun test --cwd packages/headless-core test/skill-invocation.test.ts` 因缺少 `createHeadlessSkillInvocationPort` 导出失败。
- GREEN：Skill invocation focused suite `4 pass / 14 expect()`。
- Broader：Core 全量 `50 pass / 160 expect()`，Core typecheck 通过。
- 生命周期：重复 mention 只产生一次权限请求；未知 Skill 返回 `skill_not_found`；拒绝返回 `skill_permission_denied`；pending `skill.use` 在 `loop.cancel()` 后释放并生成 `skill.failed`、`session.cancelled`，模型未被调用。
- 事件与上下文：`skill.activated` 先于 `session.completed`；Skill system message 位于 user message 之前，并使用稳定 `skill:<id>` sourceID。
- Planning：`bunx openspec validate headless-skill-registry --strict` 通过；`git diff --check` 通过。

## Review

- `code-review-spec`：新增 resolver 使用中文多行 JSDoc、作者/日期、稳定常量、显式错误码、参数对象和方法拆分；新增文件注释比例达到最低阈值；无外部 HTTP/数据库调用。
- `backend-reliability-guidelines`：权限等待复用既有可取消 Broker；Skill 激活不执行脚本，不绕过工具/文件/HTTP 权限；取消路径保持终态事件一致。
- `rest-api-documentation`：不适用，T2 未新增对外 HTTP route。
- `frontend-interaction-guidelines`：不适用，T2 未修改页面。
- `logging-boundaries`：不适用，T2 未新增生产日志。

## Result

PASS。实现与 OpenSpec task 2.1 一致，允许提交并合并到 `dev-v0.0.1`。
