# Design

## Architecture

Skill Registry 是 Headless Core 的 UI 无关端口。它只接受配置允许的本地 Skill root，扫描每个目录的 `SKILL.md`，读取 frontmatter 和正文，递归记录 references/scripts/evals 文件，并为每个包生成稳定内容摘要。注册表不保存 secret、不执行 Skill 脚本，也不把宿主机绝对路径返回给页面。

Headless Server 将 Registry 映射为列表、详情、注册/刷新和校验接口。Session Prompt 先由 Core 解析文本中的 `@skill-id`，再按 `skill.use` 权限解析 Skill 文件，生成带 mention 位置信息的 attachment；Coding Loop 看到的只是受控的 Skill content 和现有工具，不新增绕过 Permission 的执行通道。

页面提供 Skill 管理区和 Prompt 自动补全。注册操作只允许配置的 root 下的目录；激活、脚本测试和网络/文件工具仍显示在同一 Session 的权限队列。验证接口只执行 Skill manifest 声明的本地检查，并以结构化结果返回，不回显环境变量或命令输出中的敏感内容。

## Data flow

1. 服务启动时从项目 `skills/` 及显式配置的 Skill roots 扫描目录。
2. Registry 校验 `SKILL.md`、安全相对路径、frontmatter、文件大小和重复 ID，生成 `SkillSummary`。
3. 页面调用列表接口展示 ID、名称、描述、版本、文件摘要和校验状态；页面不接触本地绝对路径。
4. 用户输入 `@metric-view-lifecycle` 后，Prompt parser 解析 mention；Session service 在 `skill.use` 允许后加载完整 Skill content，并发布 skill activated 事件。
5. Skill 指令要求调用文件、shell 或外部 HTTP 时，仍走现有工具和 Permission；取消 Session 会同时清理待处理 Skill/工具请求。
6. 验证接口运行本地 eval runner，限制 cwd、超时、环境变量和输出大小，只返回 pass/fail/count/diagnostics 摘要。

## Security and failure handling

- 所有目录必须位于配置的 Skill roots 内，拒绝 `..`、符号链接逃逸、绝对路径和未知文件类型。
- 同一 ID 的重复 Skill 不静默覆盖；以显式错误返回来源冲突。
- 缺少 `SKILL.md`、frontmatter 无效、manifest 文件缺失或摘要不一致时，Skill 保持不可激活状态。
- Skill 内容、验证 stdout/stderr、环境变量和请求头均经过敏感字段过滤；错误只返回稳定 code、traceId 和安全诊断。
- 校验/测试默认网络关闭；真实数据库、Token、save/publish 只能由用户明确授权后的业务工具调用。
- 激活失败、权限拒绝和用户取消都必须是 terminal 状态，不能伪造 Skill 成功事件。

## Testing

- Core unit tests cover registry scan, hash/version, duplicate IDs, path traversal, `@skill` parser, permission denial and cancellation.
- Server contract tests cover list/detail/register/validate, stable errors, traceId, credential redaction and CORS.
- UI smoke tests cover skill list, register/refresh, autocomplete, activation, validation result and error recovery.
- Existing `metric-view-lifecycle` package tests remain an independent gate: drift check plus all `scripts/test_*.py` tests must pass.
- No test may use a real token or write to a real database; real-model smoke only verifies Skill instruction injection through the configured model adapter.
