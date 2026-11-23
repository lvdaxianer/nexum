# Design

## Context

See `proposal.md` - Why. 当前仓库的 Nexum 实现已经位于七个 `packages/nexum-*` 包中，且这些包之间没有 `@opencode/*` 运行时依赖；但根 workspace 仍通过 `packages/*` 捕获原 OpenCode 包，Turbo、Bun、安装器和文档也仍然以 OpenCode 为默认产品。

本次迁移必须在不改动 `dev` 分支的前提下完成，且不能删除 `.nexum-test/` 中的本地运行数据。根目录测试保护、包级 typecheck/test 和浏览器工作台验收都需要继续可执行。

## Goals / Non-Goals

**Goals:**

- 让根 workspace 只解析 `@nexum/*` 包。
- 让默认开发、lint、typecheck、build 和 check 入口只依赖 Nexum。
- 删除未被 Nexum 使用的 OpenCode 源码、服务、补丁和安装资产。
- 用自动化边界测试阻止旧包和旧命名空间重新进入当前分支。
- 保持 Nexum 现有模型、Session、Skill、角色提示词和文件持久化行为不变。

**Non-Goals:**

- 不为 Nexum 新增模型、Session、Skill 或协议功能。
- 不把旧 OpenCode 包重命名为 Nexum 包；已有独立 Nexum 包才是实现来源。
- 不重写历史设计、审查或 OpenSpec 归档记录。
- 不修改 `dev` 分支、远端地址或用户的外部 Skill 源目录。

## Decisions

### 1. 用显式 `packages/nexum-*` workspace 替代 `packages/*`

选择显式 glob，而不是保留宽泛 workspace 并依赖命名约定。这样 Bun/Turbo 的包发现边界由配置直接表达，新增非 Nexum 目录不会意外进入依赖图。备选方案是把旧目录全部删除但继续使用 `packages/*`，这种方式对未来回归不安全，因此不采用。

### 2. 保留七个现有 Nexum 包，不做目录重命名

这些包已经完成 Core、Adapter、Protocol、Client、Server、Surface 和 Test 的分层，且依赖方向符合项目约束。重新拆包或把旧 OpenCode Core 改名会扩大迁移面并重新引入上游耦合，因此只删除未使用的旧包。

### 3. 根脚本只组合 Nexum Test Workbench

`bun dev` 指向 `packages/nexum-test`，由它启动 Server 和 Surface；根 `lint` 只扫描 Nexum 包，根 typecheck/build 通过 Turbo 运行包级脚本。这样根入口不需要 CLI、Desktop、旧 UI 或旧 script 包。旧安装器不迁移，因为当前分支没有稳定的 Nexum 发布二进制契约。

### 4. 用仓库边界测试验证结构，而不是在运行时代码中加入守卫

结构约束只在测试中读取 workspace metadata 和目录清单，避免把“仓库不应包含旧包”的开发规则污染生产 Runtime。测试不使用 mock，只验证真实文件和真实 JSON 配置；删除旧目录后，它会持续阻止旧 workspace 包重新出现。

### 5. 历史资料保留，活动入口清理

历史 OpenSpec、设计和审查资料是决策追溯，不参与 Bun workspace、Turbo、发布或运行时。活动 README、配置和脚本必须不再把 OpenCode 当作当前产品入口；历史资料不做机械替换，避免篡改历史语义。

## Risks / Trade-offs

- [Risk] 删除旧包会使旧 OpenCode CLI、TUI、Desktop 入口不可用 → [Mitigation] 这是当前分支明确的 breaking change；`dev` 分支保留原产品，迁移前用 `git ls-files` 精确确认删除清单。
- [Risk] 旧 lockfile 或补丁残留导致 Bun 仍解析旧依赖 → [Mitigation] 删除根 `patchedDependencies` 与旧目录后重新运行 `bun install`，再用边界测试和 lockfile 搜索确认。
- [Risk] 根 lint 配置引用已删除的旧脚本 → [Mitigation] 将 Oxlint 配置收敛为无旧路径插件的基础配置，并在 `bun run check` 中验证。
- [Risk] 运行中的旧服务继续使用旧工作树 → [Mitigation] 代码迁移完成后重启本地服务，再用浏览器执行一次实际 Skill 注册和持久化验收。

## Migration Plan

1. 在任务 worktree 写入边界测试、根配置和活动文档，先观察测试按预期失败，再实现配置收敛并提交。
2. 在边界测试覆盖下删除已验证的 OpenCode 包、服务、脚本、补丁和旧安装资产，运行 `bun install` 更新 lockfile 并提交。
3. 运行所有 Nexum 包验证、根 check、OpenSpec 校验和浏览器验收。
4. 在集成 checkout 上把任务分支以 `--no-ff` 合并回 `dev-v0.0.1`；如需回滚，回滚该合并提交即可，`dev` 不受影响。

## Open Questions

无。远端仓库地址和未来 Nexum 发布安装器不属于本次迁移必须解决的问题。
