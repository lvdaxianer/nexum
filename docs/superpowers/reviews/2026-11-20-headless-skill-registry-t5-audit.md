# Headless Skill Registry T5 验收审计

日期：2026-11-20  
分支：`dev-v0.0.1` 集成链路上的 T5 验收分支  
范围：项目级 `metric-view-lifecycle` Skill、页面控制台、Headless API、Core 权限与 Prompt 注入链路。

## 验收结论

通过。页面可以输入 `@metric-view-lifecycle`，经 Headless Server 进入 Core Coding Loop，触发 `skill.use` 权限；页面批准后，Skill 内容以稳定 `sourceID` 注入模型 system message，Core 发布 `skill.activated`，模型完成后页面显示完成状态。

真实页面链路由 `packages/headless-ui/test/permission.smoke.spec.ts` 的新增测试覆盖，UI smoke 共 6/6 通过。

## Skill 本体验证

- `scripts/check_contract_drift.py`：通过，结果 `{ "ok": true }`。
- `scripts/test_*.py`：15 个测试文件，合计 100 个测试，全部通过。
- 校验内容包括 manifest、目录路径边界、摘要/内容漂移、注册发现和 Skill 资产契约。

## 分层测试证据

- Headless Core：50 tests，160 assertions，全部通过。
- Headless Server：19 tests，100 assertions，全部通过。
- Protocol：17 tests，32 assertions，全部通过。
- Client：4 tests，32 assertions，全部通过。
- Headless UI：TypeScript typecheck、生产构建通过；Playwright smoke 6/6 通过。

覆盖的核心能力包括 Function Calling、多工具续跑、权限 allow-once/allow-always/deny/取消、Question 补充信息、上下文压缩、项目上下文恢复、凭据脱敏、Skill 发现/验证/激活和页面事件流。

## 安全与契约审计

- 模型凭据只以进程环境变量输入，配置接口和页面只暴露 `credentialConfigured`，不返回密钥原文。
- Skill manifest、文件清单和验证错误不暴露越界路径或 credential-shaped 内容。
- 页面不直接导入 Core，只通过 Headless Client/Server 使用运行时能力。
- OpenSpec strict validate、生成客户端检查、`git diff --check` 和变更文件 secret pattern audit 在提交前执行。

## 交付物

- 项目级 `skills/metric-view-lifecycle` Skill 包。
- UI 无关的 Core Skill Registry 与 Skill Invocation Port。
- Headless Skill 管理 API、协议 Schema、Promise/Effect 生成客户端。
- Skill 控制台、`@` 自动补全、权限队列和激活事件展示。
- 本审计记录及 OpenSpec `headless-skill-registry` 归档。
