# T4 Per-task Audit

## Scope

- 任务边界：Headless UI Skill 管理区、`@` 自动补全、active Skill chip、校验/刷新反馈和页面冒烟测试。
- 未触及：Core Registry/Invocation、Headless API/协议、Skill 脚本执行器。
- UI 只消费 `@opencode/client` 生成客户端，不直接 import Headless Core。

## Evidence

- RED：新增页面冒烟首次因页面没有 Skill registry/`@` suggestion UI 而失败；随后实现并转 GREEN。
- UI：`bun run --cwd packages/headless-ui typecheck:tsc` 通过。
- Build：`bun run --cwd packages/headless-ui build` 通过，Vite 产物生成成功。
- Smoke：`bun run --cwd packages/headless-ui test:smoke`，5 tests 全部通过；保留既有拒绝、允许、Question、上下文压缩场景，并新增 Skill 管理/自动补全/校验场景。
- Interaction：Skill list 支持 ready/invalid/conflict 状态展示；Refresh/Validate 有 loading 防重；未知 API/校验失败通过现有 notice 区域可恢复；输入框 suggestion 使用 listbox/option 语义。
- Security：页面只渲染摘要、相对文件数量、digest 前缀和安全诊断，不渲染 root 绝对路径、凭据或 Skill 原始脚本；Prompt 仍通过普通 Session prompt API 提交。

## Review

- `frontend-design`：沿用既有工业控制台方向，使用琥珀/苔绿色状态色、紧凑信息层级、active chip 和上浮 suggestion panel；不引入新 UI 框架或通用模板。
- `frontend-interaction-guidelines`：刷新/校验按钮防重复，API 失败保持当前列表并显示 notice，autocomplete 只匹配输入末尾 token，页面卸载继续关闭 SSE。
- `code-review-spec`：新增 UI helper 使用中文多行 JSDoc、稳定状态字符串和安全 unknown narrowing；无硬编码 secret。
- `backend-reliability-guidelines`：不适用，T4 不新增后端调用；客户端调用全部复用 T3 生成契约。
- `rest-api-documentation`：不适用，T4 不新增 HTTP route。

## Result

PASS。实现与 OpenSpec task 4.1 一致，允许提交并合并到 `dev-v0.0.1`。
