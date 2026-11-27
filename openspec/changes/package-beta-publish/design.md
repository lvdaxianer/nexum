# Design

## Context

现有发布器把多个 `@nexum/*` workspace 入口编译为一个 `artifacts/nexum` tarball，内部依赖会被打包进产物，类型声明会改写为公开 subpath。现有发布验证已经覆盖 manifest、JS、声明、CLI、CSS 和仓库外 consumer，但包名仍固定为已被占用的 `nexum`，版本也固定在构建脚本中。

## Goals / Non-Goals

**Goals:**

- 生成名为 `nexum-ai`、版本为 `0.1.0-beta.0` 的可发布产物。
- 让根 README、模块文档、exports、声明引用和 consumer 验证使用同一公开包名。
- 保留现有单包结构和 `@nexum/*` workspace 开发边界。
- 在发布前验证 tarball 完整性、外部安装、类型、CLI、CSS 和 Bun 运行时约束。
- 只将 beta 发布到 `beta` dist-tag。

**Non-Goals:**

- 不把各个 `@nexum/*` workspace 包独立发布。
- 不在本次变更中重构为 Node.js 运行时或移除 `Bun.serve`、`bun:sqlite` 等现有能力。
- 不修改 Runtime、Protocol、Server 业务语义或 HTTP API。
- 不引入 Changesets 或新的版本管理系统。

## Decisions

### 1. 只修改公开发布身份，不修改内部 workspace 身份

生成 manifest 和公开文档使用 `nexum-ai`；根私有 workspace 的 `name: nexum` 以及源码包 `@nexum/*` 保持不变。这样可以避免影响仓库内部依赖图，同时让 npm 用户看到正式的产品包名。

替代方案是把所有源码 workspace 一起重命名为 `nexum-ai`，但这会扩大变更范围、污染内部依赖和 lockfile，不适合本次内测发布。

### 2. 版本通过发布配置传入并默认指向 beta 版本

release builder 使用单一发布配置生成包名和版本，默认产物为 `nexum-ai@0.1.0-beta.0`；验证器检查该身份和所有公开入口。这样后续正式版本只需要更新发布配置，不再同时维护 root/workspace 版本和脚本内散落的硬编码值。

替代方案是继续把 `0.1.0` 写死在 builder 中，虽然改动小，但容易生成错误版本或重复发布，不能作为正式发布流程。

### 3. 继续采用单包 subpath，而不是拆成多个 npm 包

保留 `nexum-ai/core`、`nexum-ai/application`、`nexum-ai/server`、`nexum-ai/persistence/*` 等入口，内部 workspace 代码继续 bundle，第三方依赖继续写入生成 manifest。这样 npm 用户只安装一个包，且与已通过的仓库外 consumer 验证模型一致。

替代方案是发布多个独立包，能降低单包安装体积，但需要处理 scoped package、独立版本、发布顺序和跨包兼容，超出本次占用名称的目标。

### 4. 明确 Bun-only，而不是隐含兼容 Node.js

公开 manifest 和 README 声明 Bun 运行时要求，consumer 验证使用 Bun。当前产物包含 `Bun.serve`、`Bun.spawn` 和 `bun:sqlite`，因此不能在本次 beta 中宣称 Node.js 通用兼容。

替代方案是本次同时实现 Node.js 兼容，需要替换 SQLite、Server 和进程执行实现，风险和范围都明显增加。

### 5. 先 dry-run，再通过 beta dist-tag 发布

发布顺序固定为：构建 → 打包 → 仓库外 consumer 验证 → `npm publish ... --tag beta` → registry 查询确认。不会使用 `latest`，也不会从仓库根目录直接发布 workspace。

## Risks / Trade-offs

- [包版本发布后不可复用] → 先使用 `0.1.0-beta.0`，发布前执行完整 tarball 和外部 consumer 验证。
- [Bun-only 限制用户范围] → 在 manifest 和文档中明确声明，后续另立 Node.js 兼容设计。
- [公开包名与内部 workspace 名称不同] → 由单一入口映射和文档校验维护，禁止公开产物泄漏 `@nexum/*`。
- [npm 凭据或网络不可用] → 发布动作放在所有本地验证通过后执行；如果 registry 发布失败，保留已验证 tarball 和命令输出，不修改运行时代码。

## Migration Plan

1. 在任务 worktree 中更新公开包名、版本配置、文档和验证器。
2. 运行 focused verification、`bun run check`、构建/打包/consumer 验证。
3. 使用 `npm publish artifacts/nexum --tag beta` 发布 `nexum-ai@0.1.0-beta.0`。
4. 使用 `npm view nexum-ai version dist-tags` 确认 registry 状态。
5. 将任务提交并合并回 `dev-v0.0.1`。

回滚策略：不删除或覆盖已发布版本；如 beta 内容有问题，修复后发布递增 beta 版本，并将 `beta` dist-tag 指向修复版本。`latest` 不受本次 beta 影响。
