# Tasks

## 1. 项目 Skill 包与 Core Registry

- [x] 1.1 将 `metric-view-lifecycle` 完整目录纳入项目 Skill root，补充 manifest/路径安全/摘要校验和 Core Registry 端口；先写 RED，再通过 Core 单测与类型检查。

## 2. Skill Prompt 与权限生命周期

- [x] 2.1 增加 `@skill-id` 解析、Prompt attachment、Skill content 注入、`skill.use` 权限和取消语义；先写 RED，再通过 Core coding-loop 回归。

## 3. Headless API 与客户端契约

- [x] 3.1 增加 Skill list/detail/register/refresh/validate/activate 路由、协议 Schema、生成客户端和 `apis/headless.md` 文档；通过 Server/Protocol/Client 测试与类型检查。

## 4. 页面控制台

- [ ] 4.1 增加 Skill 管理区、`@` 自动补全、激活状态、验证结果和错误恢复；通过 UI 类型检查、构建和 Playwright smoke。

## 5. Skill 实测与集成收口

- [ ] 5.1 使用 `metric-view-lifecycle` 做页面到 Core 的完整调用链测试，并运行 Skill 漂移检查和全部 100 个本地测试；完成安全审计、OpenSpec strict validate、最终页面验收、提交、合并和归档。

## Workflow follow-up

- 每个任务完成后执行独立审计、代码评审、测试和 Conventional Commit，再合并回 `dev-v0.0.1` 并清理任务 worktree。
